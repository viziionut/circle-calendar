"use client";

import {
  ArrowLeft, CalendarDays, CalendarRange, Copy, MapPin, Plane,
  ShieldCheck, Users,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { EventItem, Group, GroupMember, GroupRole, Profile, Vacation } from "@/types/database";
import { QuickPlanSection } from "@/components/quick-plan/QuickPlan";
import { BrandLoader, BrandMark } from "@/components/Brand";

type HubMember = GroupMember & { profile: Profile | null };

type CommonPeriod = {
  startDate: string;
  endDate: string;
  memberIds: string[];
  countriesByMember: Record<string, string[]>;
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("ro-RO", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatPeriod(startDate: string, endDate: string) {
  return startDate === endDate ? formatDate(startDate) : `${formatDate(startDate)} – ${formatDate(endDate)}`;
}

function displayName(profile: Profile | null) {
  return profile?.display_name || profile?.username || "Membru";
}

function initials(profile: Profile | null) {
  return displayName(profile).split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase();
}

function roleLabel(role: GroupRole) {
  return role === "owner" ? "Proprietar" : role === "admin" ? "Administrator" : "Membru";
}

export function calculateCommonPeriods(vacations: Vacation[], fromDate: string): CommonPeriod[] {
  const relevant = vacations.filter(vacation => vacation.end_date >= fromDate);
  const boundaries = new Set<string>();
  relevant.forEach(vacation => {
    boundaries.add(vacation.start_date < fromDate ? fromDate : vacation.start_date);
    boundaries.add(shiftDate(vacation.end_date, 1));
  });
  const ordered = [...boundaries].sort();
  const periods: Array<CommonPeriod & { signature: string }> = [];

  for (let index = 0; index < ordered.length - 1; index++) {
    const startDate = ordered[index];
    const endDate = shiftDate(ordered[index + 1], -1);
    if (endDate < startDate) continue;
    const active = relevant.filter(vacation => vacation.start_date <= startDate && vacation.end_date >= endDate);
    const memberIds = [...new Set(active.map(vacation => vacation.user_id))].sort();
    if (memberIds.length < 2) continue;

    const countriesByMember = Object.fromEntries(memberIds.map(memberId => [
      memberId,
      [...new Set(active.filter(vacation => vacation.user_id === memberId).map(vacation => vacation.country))].sort(),
    ]));
    const signature = memberIds.map(memberId => `${memberId}:${countriesByMember[memberId].join(",")}`).join("|");
    const previous = periods[periods.length - 1];
    if (previous && previous.signature === signature && shiftDate(previous.endDate, 1) === startDate) {
      previous.endDate = endDate;
    } else {
      periods.push({ startDate, endDate, memberIds, countriesByMember, signature });
    }
  }

  return periods.map(({ signature: _signature, ...period }) => period);
}

export function GroupHub({ groupId, currentUserId }: { groupId: string; currentUserId: string }) {
  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<HubMember[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [vacations, setVacations] = useState<Vacation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const today = todayIso();

  const loadHub = useCallback(async () => {
    setError("");
    const [groupResult, membersResult, eventsResult, vacationsResult] = await Promise.all([
      supabase.from("groups").select("*").eq("id", groupId).single(),
      supabase.from("group_members").select("*").eq("group_id", groupId).order("joined_at"),
      supabase.from("events").select("*").eq("group_id", groupId).gte("event_date", today).order("event_date").order("event_time"),
      supabase.from("vacations").select("*").eq("group_id", groupId).gte("end_date", today).order("start_date"),
    ]);

    const firstError = groupResult.error || membersResult.error || eventsResult.error || vacationsResult.error;
    if (firstError) {
      setError(firstError.message);
      setLoading(false);
      return;
    }

    const memberRows = (membersResult.data || []) as GroupMember[];
    const userIds = memberRows.map(member => member.user_id);
    const profilesResult = userIds.length
      ? await supabase.from("profiles").select("*").in("id", userIds)
      : { data: [], error: null };
    if (profilesResult.error) {
      setError(profilesResult.error.message);
      setLoading(false);
      return;
    }
    const profiles = new Map(((profilesResult.data || []) as Profile[]).map(profile => [profile.id, profile]));

    setGroup(groupResult.data as Group);
    setMembers(memberRows.map(member => ({ ...member, profile: profiles.get(member.user_id) || null })));
    setEvents((eventsResult.data || []) as EventItem[]);
    setVacations((vacationsResult.data || []) as Vacation[]);
    setLoading(false);
  }, [groupId, today]);

  useEffect(() => {
    void loadHub();
    const channel = supabase.channel(`group-hub-${groupId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "group_members", filter: `group_id=eq.${groupId}` }, () => void loadHub())
      .on("postgres_changes", { event: "*", schema: "public", table: "events", filter: `group_id=eq.${groupId}` }, () => void loadHub())
      .on("postgres_changes", { event: "*", schema: "public", table: "vacations", filter: `group_id=eq.${groupId}` }, () => void loadHub())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [groupId, loadHub]);

  const commonPeriods = useMemo(() => calculateCommonPeriods(vacations, today), [vacations, today]);
  const countries = useMemo(() => {
    const grouped = new Map<string, Vacation[]>();
    vacations.forEach(vacation => grouped.set(vacation.country, [...(grouped.get(vacation.country) || []), vacation]));
    return [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right, "ro"));
  }, [vacations]);
  const memberById = useMemo(() => new Map(members.map(member => [member.user_id, member])), [members]);

  if (loading) return <main className="groupHubLoading"><BrandLoader label="Se încarcă grupul…"/></main>;
  if (error || !group) return <main className="groupHubError"><Users/><h1>Grup indisponibil</h1><p>{error || "Nu ai acces la acest grup."}</p><a href="/"><ArrowLeft/> Înapoi în aplicație</a></main>;

  async function copyInviteCode() {
    await navigator.clipboard.writeText(group!.invite_code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return <main className="groupHub">
    <header className="groupHubTopbar">
      <a href="/"><ArrowLeft/> Înapoi</a>
      <div className="groupHubBrand"><BrandMark/><strong>Group Hub</strong></div>
      <small>{members.some(member => member.user_id === currentUserId) ? "MEMBRU AL GRUPULUI" : ""}</small>
    </header>

    <div className="groupHubContent">
      <section className="groupHubHero">
        <div>
          <small>CIRCLE CALENDAR · GROUP HUB</small>
          <h1>{group.name}</h1>
          <p>{group.description || "Fără descriere"}</p>
        </div>
        <div className="groupHubStats">
          <div><Users/><strong>{members.length}</strong><span>{members.length === 1 ? "membru" : "membri"}</span></div>
          <button onClick={copyInviteCode}><Copy/><span>COD INVITAȚIE</span><strong>{copied ? "COPIAT" : group.invite_code}</strong></button>
        </div>
      </section>

      <QuickPlanSection
        groupId={groupId}
        currentUserId={currentUserId}
        memberIds={members.map(member => member.user_id)}
        events={events}
        vacations={vacations}
      />

      <section className="hubSection">
        <header><div><small>ECHIPA</small><h2>Membrii grupului</h2></div><span>{members.length} total</span></header>
        <div className="hubMemberGrid">{members.map(member => {
          const memberVacations = vacations.filter(vacation => vacation.user_id === member.user_id);
          const currentVacation = memberVacations.find(vacation => vacation.start_date <= today && vacation.end_date >= today);
          const nextVacation = currentVacation || memberVacations.find(vacation => vacation.start_date > today);
          const status = currentVacation ? "În concediu" : nextVacation ? "Disponibil" : "Fără informații";
          const statusClass = currentVacation ? "away" : nextVacation ? "available" : "unknown";
          return <article className="hubMemberCard" key={member.user_id}>
            <div className="hubAvatar">{member.profile?.avatar_url ? <img src={member.profile.avatar_url} alt=""/> : initials(member.profile)}</div>
            <div className="hubMemberIdentity"><h3>{displayName(member.profile)}</h3><span><ShieldCheck/>{roleLabel(member.role)}</span></div>
            <span className={`hubStatus ${statusClass}`}>{status}</span>
            <div className="hubNextVacation">
              {nextVacation ? <><Plane/><div><small>{currentVacation ? "CONCEDIU CURENT" : "URMĂTORUL CONCEDIU"}</small><strong>{nextVacation.country}</strong><span>{formatPeriod(nextVacation.start_date, nextVacation.end_date)}</span></div></> : <><CalendarRange/><div><small>CONCEDII</small><strong>Fără informații</strong><span>Nu există perioade introduse.</span></div></>}
            </div>
          </article>;
        })}</div>
      </section>

      <div className="hubTwoColumns">
        <section className="hubSection">
          <header><div><small>AGENDA GRUPULUI</small><h2>Evenimente viitoare</h2></div><CalendarDays/></header>
          <div className="hubTimeline">{events.length ? events.map(event => <article key={event.id}><time><strong>{new Date(`${event.event_date}T12:00:00`).getDate()}</strong><span>{new Date(`${event.event_date}T12:00:00`).toLocaleDateString("ro-RO",{month:"short"})}</span></time><div><h3>{event.title}</h3><p>{event.event_time?.slice(0,5) || "Fără oră"} · {event.location || "Fără locație"}</p></div></article>) : <HubEmpty text="Nu există evenimente viitoare."/>}</div>
        </section>

        <section className="hubSection">
          <header><div><small>PLANURI</small><h2>Concedii viitoare</h2></div><Plane/></header>
          <div className="hubTimeline vacationTimeline">{vacations.length ? vacations.map(vacation => <article key={vacation.id}><time><Plane/><span>{vacation.country}</span></time><div><h3>{displayName(memberById.get(vacation.user_id)?.profile || null)}</h3><p>{formatPeriod(vacation.start_date, vacation.end_date)}</p></div></article>) : <HubEmpty text="Nu există concedii viitoare."/>}</div>
        </section>
      </div>

      <section className="hubSection commonPeriods">
        <header><div><small>PLANIFICARE ÎMPREUNĂ</small><h2>Când ne sincronizăm?</h2><p>Perioade în care cel puțin doi membri sunt simultan în concediu.</p></div><Users/></header>
        {commonPeriods.length ? <div className="commonPeriodGrid">{commonPeriods.map(period => <article key={`${period.startDate}-${period.endDate}-${period.memberIds.join("-")}`}>
          <div className="commonPeriodDate"><CalendarRange/><strong>{formatPeriod(period.startDate, period.endDate)}</strong><span>{period.memberIds.length} membri</span></div>
          <div className="commonPeople">{period.memberIds.map(memberId => <div key={memberId}><span>{initials(memberById.get(memberId)?.profile || null)}</span><p><strong>{displayName(memberById.get(memberId)?.profile || null)}</strong><small><MapPin/>{period.countriesByMember[memberId].join(", ")}</small></p></div>)}</div>
        </article>)}</div> : <HubEmpty text="Nu există încă perioade comune pentru cel puțin doi membri."/>}
      </section>

      <section className="hubSection countrySection">
        <header><div><small>HARTA PLANURILOR</small><h2>Unde vor fi membrii</h2></div><MapPin/></header>
        {countries.length ? <div className="countryGrid">{countries.map(([country, countryVacations]) => {
          const uniqueMembers = [...new Set(countryVacations.map(vacation => vacation.user_id))];
          return <article key={country}><div className="countryTitle"><MapPin/><div><h3>{country}</h3><span>{uniqueMembers.length} {uniqueMembers.length === 1 ? "membru" : "membri"}</span></div></div><div>{uniqueMembers.map(memberId => <span key={memberId}>{displayName(memberById.get(memberId)?.profile || null)}</span>)}</div></article>;
        })}</div> : <HubEmpty text="Nu sunt destinații viitoare de afișat."/>}
      </section>
    </div>
  </main>;
}

function HubEmpty({ text }: { text: string }) {
  const illustration = text.includes("evenimente") ? "events" : text.includes("concedii") || text.includes("destinații") ? "vacations" : "groups";
  return <div className="hubEmpty"><img className="brandEmptyIllustration" src={`/brand/empty/${illustration}.svg`} alt=""/><p>{text}</p></div>;
}
