"use client";

import { CalendarDays, ChevronRight, Flame, Plane, Sparkles, TrendingUp, Users } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { EventItem, Group, Profile, Vacation } from "@/types/database";
import { PendingQuickPlans } from "@/components/quick-plan/QuickPlan";

function dateLabel(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("ro-RO", { day: "numeric", month: "short" });
}

function initials(profile: Profile | null) {
  const name = profile?.display_name || profile?.username || "CC";
  return name.split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase();
}

export const MobileDashboard = memo(function MobileDashboard({
  profile, groups, activeGroupId, currentUserId, events, vacations, onEvent, onCalendar, onVacations,
}: {
  profile: Profile | null;
  groups: Group[];
  activeGroupId: string;
  currentUserId: string;
  events: EventItem[];
  vacations: Vacation[];
  onEvent: (event: EventItem) => void;
  onCalendar: () => void;
  onVacations: () => void;
}) {
  const [recommendation, setRecommendation] = useState<any>(null);
  const upcoming = useMemo(() => events.filter(event => event.event_date >= new Date().toISOString().slice(0, 10)), [events]);
  const nextEvent = upcoming[0];
  const today = new Date();
  const week = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() + index);
    return date;
  }), []);

  const loadRecommendation = useCallback(async () => {
    if (!activeGroupId) return;
    const { data } = await supabase
      .from("quick_plans")
      .select("id,title,activity_emoji,group_id,quick_plan_options(start_date,end_date,score,rank)")
      .eq("group_id", activeGroupId)
      .eq("status", "voting")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) {
      const options = [...((data as any).quick_plan_options || [])].sort((left, right) => left.rank - right.rank);
      setRecommendation({ ...data, option: options[0] });
    } else setRecommendation(null);
  }, [activeGroupId]);

  useEffect(() => { void loadRecommendation(); }, [loadRecommendation]);

  return <div className="mobileDashboard">
    <section className="mobileHeroCard">
      <div className="mobileHeroTop">
        <div><small>BUN VENIT ÎN CERCUL TĂU</small><h1>Salut, {profile?.display_name?.split(" ")[0] || profile?.username || "prietene"}</h1><p>Planurile voastre, într-un singur loc.</p></div>
        <span className="mobileHeroAvatar">{profile?.avatar_url ? <img src={profile.avatar_url} alt=""/> : initials(profile)}</span>
      </div>
      <div className="mobileHeroStatus"><span><i/> Sincronizat</span><strong>{groups.find(group => group.id === activeGroupId)?.name}</strong></div>
    </section>

    <PendingQuickPlans groups={groups} currentUserId={currentUserId}/>

    <section className="mobileSectionCard mobileNextEvent">
      <header><div><small>URMĂTORUL EVENIMENT</small><h2>{nextEvent ? nextEvent.title : "Agenda este liberă"}</h2></div><CalendarDays/></header>
      {nextEvent ? <button onClick={() => onEvent(nextEvent)}><time><strong>{new Date(`${nextEvent.event_date}T12:00:00`).getDate()}</strong><span>{new Date(`${nextEvent.event_date}T12:00:00`).toLocaleDateString("ro-RO",{month:"short"})}</span></time><div><strong>{nextEvent.event_time?.slice(0,5)||"Toată ziua"}</strong><span>{nextEvent.location||"Locație nespecificată"}</span></div><ChevronRight/></button> : <p>Momentul perfect pentru un Quick Plan nou.</p>}
    </section>

    <section className="mobileSectionCard mobileRecommendation">
      <header><div><small>QUICK PLAN RECOMANDAT</small><h2>{recommendation ? `${recommendation.activity_emoji} ${recommendation.title}` : "Creează următorul plan"}</h2></div><Flame/></header>
      {recommendation?.option ? <a href={`/groups/${activeGroupId}#quick-plan`}><div><strong>{dateLabel(recommendation.option.start_date)} – {dateLabel(recommendation.option.end_date)}</strong><span>Cea mai bună variantă</span></div><i>{recommendation.option.score}%</i><ChevronRight/></a> : <a href={`/groups/${activeGroupId}#quick-plan`}><div><strong>Găsește data perfectă</strong><span>Circle verifică disponibilitatea grupului</span></div><Sparkles/><ChevronRight/></a>}
    </section>

    <section className="mobileSectionCard mobileWeek">
      <header><div><small>URMĂTOARELE 7 ZILE</small><h2>Calendar compact</h2></div><button onClick={onCalendar}>Deschide</button></header>
      <div>{week.map(date => {
        const iso = date.toISOString().slice(0,10);
        const count = events.filter(event => event.event_date === iso).length;
        const isToday = iso === new Date().toISOString().slice(0,10);
        return <button key={iso} className={isToday ? "today" : ""} onClick={onCalendar}><span>{date.toLocaleDateString("ro-RO",{weekday:"short"}).slice(0,2)}</span><strong>{date.getDate()}</strong>{count > 0 && <i>{count}</i>}</button>;
      })}</div>
    </section>

    <section className="mobileSectionCard mobileVacationPreview">
      <header><div><small>VACANȚE</small><h2>Unde va fi grupul</h2></div><button onClick={onVacations}>Vezi toate</button></header>
      {vacations.length ? <div>{vacations.slice(0,3).map(vacation => <button key={vacation.id} onClick={onVacations}><span><Plane/></span><div><strong>{vacation.country}</strong><small>{dateLabel(vacation.start_date)} – {dateLabel(vacation.end_date)}</small></div><ChevronRight/></button>)}</div> : <p>Nicio vacanță planificată în perioada următoare.</p>}
    </section>

    <section className="mobileStats">
      <article><CalendarDays/><strong>{upcoming.length}</strong><span>evenimente</span></article>
      <article><Plane/><strong>{vacations.length}</strong><span>vacanțe</span></article>
      <article><Users/><strong>{groups.length}</strong><span>grupuri</span></article>
      <article><TrendingUp/><strong>{recommendation?.option?.score || 0}%</strong><span>match</span></article>
    </section>
  </div>;
});
