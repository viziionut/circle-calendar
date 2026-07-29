"use client";

import {
  Bell, CalendarDays, Camera, Check, ChevronLeft, ChevronRight, Clipboard, Upload, Maximize2, Minimize2,
  Compass, Home, Images, Link2, LogOut, Menu, Plane, Plus, Send, Settings, SkipBack, SkipForward,
  Share2, Sparkles, UserCircle, UserPlus, Users, X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { AppNotification, Brand, EventItem, EventMedia, Group, NotificationPreferences, Profile, Vacation } from "@/types/database";
import { EventModal } from "./EventModal";
import { VacationsPage } from "./VacationsPage";
import { AdminNavItem } from "./admin/AdminNavItem";
import { PendingQuickPlans } from "./quick-plan/QuickPlan";
import { MobileDashboard } from "./mobile/MobileDashboard";
import { BrandLoader, BrandMark } from "./Brand";
import { NotificationCenter } from "./notifications/NotificationCenter";
import { fetchNotificationPreferences, saveNotificationPreferences } from "@/lib/notifications";
import { useI18n } from "@/lib/i18n";
import {
  eventNavigationTarget, navigableEvents, nextCalendarEvent,
  previousCalendarEvent,
} from "@/lib/calendarNavigation";

type View = "home" | "calendar" | "vacations" | "media" | "groups" | "settings";
type Dialog = "create" | "join" | "invite" | null;

function isoToday() { return new Date().toISOString().slice(0, 10); }
function monthTitle(date: Date, locale = "ro-RO") { return date.toLocaleDateString(locale, { month: "long", year: "numeric" }); }
function formatDate(value: string, locale = "ro-RO") { return new Date(`${value}T12:00:00`).toLocaleDateString(locale, { day: "numeric", month: "long" }); }
function normaliseCode(value: string) { return value.trim().toUpperCase().replace(/\s+/g, ""); }

export function AppShell({ session }: { session: Session }) {
  const { setLocale, t } = useI18n();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [activeGroupId, setActiveGroupId] = useState("");
  const [events, setEvents] = useState<EventItem[]>([]);
  const [vacations, setVacations] = useState<Vacation[]>([]);
  const [vacationMemberNames, setVacationMemberNames] = useState<Record<string, string>>({});
  const [calendarProfiles, setCalendarProfiles] = useState<Record<string, Profile>>({});
  const [eventParticipantCounts, setEventParticipantCounts] = useState<Record<string, number>>({});
  const [allMedia, setAllMedia] = useState<EventMedia[]>([]);
  const [view, setView] = useState<View>("home");
  const [month, setMonth] = useState(new Date());
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);
  const [selectedDate, setSelectedDate] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }, []);

  const loadProfile = useCallback(async () => {
    const { data, error } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
    if (error) console.error(error);
    const nextProfile = data as Profile | null;
    setProfile(nextProfile);
    if (nextProfile?.locale) setLocale(nextProfile.locale);
  }, [session.user.id, setLocale]);

  const loadGroups = useCallback(async () => {
    const { data, error } = await supabase.from("group_members").select("groups(*)").eq("user_id", session.user.id);
    if (error) { console.error(error); return; }
    const rows = (data || []).map((row: any) => row.groups).filter(Boolean) as Group[];
    setGroups(rows);
    setActiveGroupId(current => rows.some(group => group.id === current) ? current : rows[0]?.id || "");
  }, [session.user.id]);

  const loadEvents = useCallback(async () => {
    if (!activeGroupId) { setEvents([]); return; }
    const { data, error } = await supabase.from("events").select("*").eq("group_id", activeGroupId).order("event_date");
    if (error) console.error(error);
    const rows = (data || []) as EventItem[];
    setEvents(rows);
    const eventIds = rows.map(event => event.id);
    const creatorIds = [...new Set(rows.map(event => event.created_by))];
    const [rsvpsResult, profilesResult] = await Promise.all([
      eventIds.length ? supabase.from("event_rsvps").select("event_id,user_id,status").in("event_id", eventIds).eq("status", "yes") : Promise.resolve({ data: [], error: null }),
      creatorIds.length ? supabase.from("profiles").select("*").in("id", creatorIds) : Promise.resolve({ data: [], error: null }),
    ]);
    if (rsvpsResult.error) console.error(rsvpsResult.error);
    if (profilesResult.error) console.error(profilesResult.error);
    setEventParticipantCounts(Object.fromEntries(eventIds.map(eventId => [
      eventId,
      Math.max(1, new Set((rsvpsResult.data || []).filter(rsvp => rsvp.event_id === eventId).map(rsvp => rsvp.user_id)).size),
    ])));
    setCalendarProfiles(current => ({ ...current, ...Object.fromEntries(((profilesResult.data || []) as Profile[]).map(item => [item.id, item])) }));
  }, [activeGroupId]);

  const loadMedia = useCallback(async () => {
    if (!activeGroupId) { setAllMedia([]); return; }
    const { data, error } = await supabase.from("event_media").select("*").eq("group_id", activeGroupId).order("created_at", { ascending: false });
    if (error) console.error(error);
    const rows = (data || []) as EventMedia[];
    const signed = await Promise.all(rows.map(async item => {
      const { data: signedData } = await supabase.storage.from("event-media").createSignedUrl(item.storage_path, 3600);
      return { ...item, signed_url: signedData?.signedUrl };
    }));
    setAllMedia(signed);
  }, [activeGroupId]);

  const loadVacations = useCallback(async () => {
    if (!activeGroupId) {
      setVacations([]);
      setVacationMemberNames({});
      return;
    }
    const { data, error } = await supabase.from("vacations").select("*").eq("group_id", activeGroupId).order("start_date");
    if (error) {
      console.error(error);
      return;
    }
    const rows = (data || []) as Vacation[];
    setVacations(rows);
    const userIds = [...new Set(rows.map(vacation => vacation.user_id))];
    if (!userIds.length) {
      setVacationMemberNames({});
      return;
    }
    const { data: profileRows, error: profileError } = await supabase.from("profiles").select("id,display_name,username").in("id", userIds);
    if (profileError) {
      console.error(profileError);
      return;
    }
    setVacationMemberNames(Object.fromEntries((profileRows || []).map(row => [
      row.id,
      row.display_name || row.username || "Membru al grupului",
    ])));
    setCalendarProfiles(current => ({ ...current, ...Object.fromEntries(((profileRows || []) as Profile[]).map(item => [item.id, item])) }));
  }, [activeGroupId]);

  useEffect(() => { void Promise.all([loadProfile(), loadGroups()]).finally(() => setLoading(false)); }, [loadProfile, loadGroups]);
  useEffect(() => { void loadEvents(); void loadMedia(); void loadVacations(); }, [loadEvents, loadMedia, loadVacations]);
  useEffect(() => {
    if (!activeGroupId) return;
    const channel = supabase.channel(`circle-${activeGroupId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "events", filter: `group_id=eq.${activeGroupId}` }, () => void loadEvents())
      .on("postgres_changes", { event: "*", schema: "public", table: "event_media", filter: `group_id=eq.${activeGroupId}` }, () => void loadMedia())
      .on("postgres_changes", { event: "*", schema: "public", table: "vacations", filter: `group_id=eq.${activeGroupId}` }, () => void loadVacations())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [activeGroupId, loadEvents, loadMedia, loadVacations]);

  async function createGroup(name: string, description = "") {
    const { data, error } = await supabase.from("groups").insert({ name, description, owner_id: session.user.id }).select().single();
    if (error) throw error;
    await loadGroups();
    setActiveGroupId(data.id);
    setView("groups");
    notify("Grupul a fost creat.");
  }

  async function joinGroup(inviteCode: string) {
    const code = normaliseCode(inviteCode);
    if (!code) throw new Error("Introdu codul de invitație.");
    const { data, error } = await supabase.rpc("join_group_by_invite_code", { supplied_code: code });
    if (error) throw error;
    await loadGroups();
    if (data) setActiveGroupId(data as string);
    setView("groups");
    notify("Ai intrat în grup.");
  }

  const activeGroup = groups.find(group => group.id === activeGroupId);
  const inviteLink = activeGroup ? `${typeof window !== "undefined" ? window.location.origin : ""}/?invite=${activeGroup.invite_code}` : "";
  const upcoming = useMemo(() => events.filter(event => event.event_date >= isoToday()).slice(0, 5), [events]);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("invite");
    if (code) setDialog("join");
  }, []);

  const openView = (next: View) => { setView(next); setMenuOpen(false); };
  const openNotification = (notification: AppNotification) => {
    if (notification.entity_type === "event" && notification.entity_id) {
      const event = events.find(item => item.id === notification.entity_id);
      if (event) {
        setSelectedEvent(event);
        setSelectedDate(event.event_date);
        setModalOpen(true);
      } else {
        const date = typeof notification.metadata.event_date === "string" ? notification.metadata.event_date : "";
        if (date) setMonth(new Date(`${date}T12:00:00`));
        setView("calendar");
      }
      return;
    }
    if (notification.entity_type === "quick_plan" && notification.group_id) {
      window.location.assign(`/groups/${notification.group_id}?plan=${notification.entity_id || ""}#quick-plan`);
      return;
    }
    if (notification.entity_type === "group" && notification.group_id) {
      window.location.assign(`/groups/${notification.group_id}`);
      return;
    }
    if (notification.entity_type === "vacation") {
      setView("vacations");
      return;
    }
    setView("home");
  };

  if (loading) return <main className="loadingPage"><BrandLoader label="Se conectează la Circle Calendar…"/></main>;

  if (!groups.length) return <main className={`onboarding ${profile?.brand || "bros"}`}>
    <section className="onboardingCard">
      <BrandMark className="onboardingBrandMark"/>
      <small>CIRCLE CALENDAR v6.0</small>
      <h1>Bun venit, {profile?.display_name || "prietene"}</h1>
      <img className="brandEmptyIllustration" src="/brand/empty/groups.svg" alt=""/>
      <p>Creează un cerc nou sau intră în grupul prietenilor cu un cod de invitație.</p>
      <div className="onboardingActions">
        <button className="primary" onClick={() => setDialog("create")}><Plus/> Creează grup</button>
        <button className="secondary" onClick={() => setDialog("join")}><UserPlus/> Intră cu un cod</button>
      </div>
      <button className="textButton" onClick={() => supabase.auth.signOut()}>Log out</button>
    </section>
    {dialog === "create" && <CreateGroupDialog onClose={() => setDialog(null)} onCreate={createGroup}/>} 
    {dialog === "join" && <JoinGroupDialog initialCode={typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("invite") || "" : ""} onClose={() => setDialog(null)} onJoin={joinGroup}/>} 
    {toast && <div className="toast"><Check/> {toast}</div>}
  </main>;

  const pageTitle = t(view === "media" ? "nav.memories" : view === "settings" ? "nav.settings" : `nav.${view}`);

  return <main className={`app ${profile?.brand || "bros"} theme-${profile?.theme || "neon"}`}>
    <aside className={menuOpen ? "sidebar open" : "sidebar"}>
      <div className="sidebarFixedTop">
        <div className="sideLogo"><BrandMark/><div><strong>Circle Calendar <em className="versionBadge">v6.3</em></strong><small>PLAN. SHARE. REMEMBER.</small></div><button className="mobileClose" onClick={() => setMenuOpen(false)}><X/></button></div>
        <label className="groupPicker">GRUP ACTIV<select value={activeGroupId} onChange={event => setActiveGroupId(event.target.value)}>{groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
      </div>
      <nav className="sidebarScrollArea">
        <button className={view === "home" ? "active" : ""} onClick={() => openView("home")}><Home/>{t("nav.home")}</button>
        <button className={view === "calendar" ? "active" : ""} onClick={() => openView("calendar")}><CalendarDays/>{t("nav.calendar")}</button>
        <button className={view === "vacations" ? "active" : ""} onClick={() => openView("vacations")}><Plane/>{t("nav.vacations")}</button>
        <button className={view === "media" ? "active" : ""} onClick={() => openView("media")}><Images/>{t("nav.memories")}</button>
        <button className={view === "groups" ? "active" : ""} onClick={() => openView("groups")}><Users/>{t("nav.groups")}</button>
        <div className="navDivider"/>
        <button onClick={() => { setDialog("join"); setMenuOpen(false); }}><UserPlus/>{t("nav.join")}</button>
        <button onClick={() => { setDialog("invite"); setMenuOpen(false); }}><Send/>{t("nav.invite")}</button>
        <button className={view === "settings" ? "active" : ""} onClick={() => openView("settings")}><Settings/>{t("nav.settings")}</button>
        <AdminNavItem onNavigate={() => setMenuOpen(false)}/>
        <button className="logout" onClick={() => supabase.auth.signOut()}><LogOut/> Log out</button>
      </nav>
      <div className="sidebarFixedBottom">
        <button className="inviteBox" onClick={() => setDialog("invite")}><small>{t("nav.inviteCode")}</small><strong>{activeGroup?.invite_code}</strong><span><Share2/> {t("nav.invite")}</span></button>
      </div>
    </aside>

    <section className="mainContent">
      <header className="topbar"><button className="menuToggle" onClick={() => setMenuOpen(true)}><Menu/></button><div><small>{activeGroup?.name}</small><h2>{pageTitle}</h2></div><div className="topActions"><NotificationCenter userId={session.user.id} onNavigate={openNotification}/><button className="primary compact" onClick={() => {setSelectedEvent(null);setSelectedDate(isoToday());setModalOpen(true);}}><Plus/> Eveniment</button></div></header>

      {view === "home" && <><div className="page desktopDashboard"><section className="welcome"><div><small>BINE AI REVENIT</small><h1>Salut, {profile?.display_name || profile?.username || "prietene"} 👋</h1><p>Următorul eveniment, albumele recente și grupul tău sunt aici.</p></div><button className="primary" onClick={() => {setSelectedEvent(null);setSelectedDate(isoToday());setModalOpen(true);}}><Plus/> Creează eveniment</button></section><div className="dashboardGrid"><PendingQuickPlans groups={groups} currentUserId={session.user.id}/><section className="panel"><header><div><small>URMEAZĂ</small><h3>Evenimente viitoare</h3></div><button onClick={() => setView("calendar")}>Vezi calendarul</button></header>{upcoming.length ? upcoming.map(event => <button className="eventListRow" key={event.id} onClick={() => {setSelectedEvent(event);setModalOpen(true);}}><span className="dateBox"><b>{new Date(`${event.event_date}T12:00:00`).getDate()}</b><small>{new Date(`${event.event_date}T12:00:00`).toLocaleDateString("ro-RO",{month:"short"})}</small></span><span><strong>{event.title}</strong><small>{event.event_time?.slice(0,5) || "Fără oră"} · {event.location || "Fără locație"}</small></span></button>) : <div className="emptyState brandedEmpty"><img src="/brand/empty/events.svg" alt=""/><span>Nu ai evenimente viitoare.</span></div>}</section><section className="panel memoryPreview"><header><div><small>ALBUME</small><h3>Media recentă</h3></div><button onClick={() => setView("media")}>Vezi toate</button></header><div className="miniMediaGrid">{allMedia.slice(0,6).map(item => item.mime_type.startsWith("video/") ? <video key={item.id} src={item.signed_url}/> : <img key={item.id} src={item.signed_url} alt=""/> )}</div>{!allMedia.length && <div className="emptyState"><Camera/> Pozele vor apărea aici după ce le adaugi într-un eveniment.</div>}</section></div></div><MobileDashboard profile={profile} groups={groups} activeGroupId={activeGroupId} currentUserId={session.user.id} events={events} vacations={vacations} onEvent={event=>{setSelectedEvent(event);setSelectedDate(event.event_date);setModalOpen(true);}} onCalendar={()=>setView("calendar")} onVacations={()=>setView("vacations")} onRefresh={async()=>{await Promise.all([loadGroups(),loadEvents(),loadVacations()])}}/></>}

      {view === "calendar" && <CalendarPage groupId={activeGroupId} month={month} setMonth={setMonth} events={events} vacations={vacations} profiles={calendarProfiles} participantCounts={eventParticipantCounts} onEvent={event => {setSelectedEvent(event);setSelectedDate(event.event_date);setModalOpen(true);}} onVacation={() => setView("vacations")} onCreateDate={date => {setSelectedEvent(null);setSelectedDate(date);setModalOpen(true);}}/>}
      {view === "vacations" && <VacationsPage vacations={vacations} groupId={activeGroupId} userId={session.user.id} memberNames={vacationMemberNames} onChanged={loadVacations}/>}
      {view === "media" && <div className="page"><section className="pageTitle"><small>CIRCLE MEMORIES</small><h1>Arhiva evenimentelor</h1><p>Fiecare album este creat automat din media încărcată în evenimente.</p></section><div className="albumCards">{events.filter(event => allMedia.some(media => media.event_id === event.id)).map(event => {const items=allMedia.filter(media => media.event_id===event.id);return <button key={event.id} className="albumCard" onClick={() => {setSelectedEvent(event);setModalOpen(true);}}><div className="albumCover">{items[0]?.mime_type.startsWith("video/") ? <video src={items[0]?.signed_url}/> : <img src={items[0]?.signed_url} alt=""/>}<span>{items.length}</span></div><div><strong>{event.title}</strong><small>{formatDate(event.event_date)} · {items.filter(item=>item.mime_type.startsWith("image/")).length} poze · {items.filter(item=>item.mime_type.startsWith("video/")).length} video</small></div></button>})}</div>{!allMedia.length && <div className="largeEmpty"><Images/><h3>Arhiva este goală</h3><p>Deschide un eveniment și adaugă poze sau videoclipuri.</p></div>}</div>}
      {view === "groups" && <GroupsPage groups={groups} activeGroupId={activeGroupId} onSelect={setActiveGroupId} onCreate={() => setDialog("create")} onJoin={() => setDialog("join")} onInvite={(groupId) => { setActiveGroupId(groupId); setDialog("invite"); }}/>} 
      {view === "settings" && profile && <SettingsPage profile={profile} email={session.user.email || ""} onSaved={async () => { await loadProfile(); notify(t("settings.saved")); }}/>}
    </section>

    <footer className="appBrandFooter"><BrandMark/><span>Circle Calendar · Plan. Share. Remember.</span></footer>
    <nav className="mobileNav"><button className={view==="home"?"active":""} onClick={()=>setView("home")}><Home/><span>{t("nav.home")}</span></button><button className={view==="calendar"?"active":""} onClick={()=>setView("calendar")}><CalendarDays/><span>{t("nav.calendar")}</span></button><button className="mobilePlus" onClick={()=>setMobileActionsOpen(true)}><Plus/><span>{t("nav.newPlan")}</span></button><button className={view==="groups"?"active":""} onClick={()=>setView("groups")}><Users/><span>{t("nav.groups")}</span></button><button className={view==="settings"?"active":""} onClick={()=>setView("settings")}><UserCircle/><span>{t("nav.profile")}</span></button></nav>

    {modalOpen && <EventModal event={selectedEvent} initialDate={selectedDate || isoToday()} groupId={activeGroupId} userId={session.user.id} onClose={() => setModalOpen(false)} onSaved={async () => {await loadEvents();await loadMedia();}} onDeleted={async () => {await loadEvents();await loadMedia();}}/>}
    {dialog === "create" && <CreateGroupDialog onClose={() => setDialog(null)} onCreate={createGroup}/>} 
    {dialog === "join" && <JoinGroupDialog initialCode={typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("invite") || "" : ""} onClose={() => setDialog(null)} onJoin={joinGroup}/>} 
    {dialog === "invite" && activeGroup && <InviteDialog group={activeGroup} inviteLink={inviteLink} onClose={() => setDialog(null)} notify={notify}/>} 
    {mobileActionsOpen && <MobileActionSheet groupId={activeGroupId} onClose={()=>setMobileActionsOpen(false)} onEvent={()=>{setMobileActionsOpen(false);setSelectedEvent(null);setSelectedDate(isoToday());setModalOpen(true);}} onVacation={()=>{setMobileActionsOpen(false);setView("vacations");}} onInvite={()=>{setMobileActionsOpen(false);setDialog("invite");}}/>}
    {toast && <div className="toast"><Check/> {toast}</div>}
  </main>;
}

function MobileActionSheet({groupId,onClose,onEvent,onVacation,onInvite}:{groupId:string;onClose:()=>void;onEvent:()=>void;onVacation:()=>void;onInvite:()=>void}) {
  const touchStart = useRef(0);
  return <div className="mobileSheetBack" onMouseDown={event=>{if(event.target===event.currentTarget)onClose()}}>
    <section className="mobileActionSheet" onTouchStart={event=>{touchStart.current=event.touches[0].clientY}} onTouchEnd={event=>{if(event.changedTouches[0].clientY-touchStart.current>70)onClose()}}>
      <span className="sheetHandle"/>
      <header><div><small>ACȚIUNE RAPIDĂ</small><h2>Ce vrei să planifici?</h2></div><button className="iconButton" onClick={onClose}><X/></button></header>
      <div className="mobileActionGrid">
        <button onClick={onEvent}><span><CalendarDays/></span><strong>Eveniment</strong><small>Adaugă în calendar</small></button>
        <a href={`/groups/${groupId}#quick-plan`}><span><Sparkles/></span><strong>Quick Plan</strong><small>Găsește data ideală</small></a>
        <button onClick={onVacation}><span><Plane/></span><strong>Vacanță</strong><small>Adaugă perioada</small></button>
        <button onClick={onInvite}><span><UserPlus/></span><strong>Invită membru</strong><small>Trimite codul grupului</small></button>
      </div>
    </section>
  </div>;
}

function DialogShell({ title, eyebrow, onClose, children }: { title: string; eyebrow: string; onClose: () => void; children: ReactNode }) {
  const touchStart = useRef(0);
  return <div className="modalBack" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section className="smallModal swipeableSheet" onTouchStart={event=>{touchStart.current=event.touches[0].clientY}} onTouchEnd={event=>{if(event.changedTouches[0].clientY-touchStart.current>85)onClose()}}><span className="sheetHandle"/><header className="modalHeader"><div><small>{eyebrow}</small><h2>{title}</h2></div><button className="iconButton" onClick={onClose}><X/></button></header>{children}</section></div>;
}

function CreateGroupDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string, description: string) => Promise<void> }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  return <DialogShell title="Creează un grup" eyebrow="UN CERC NOU" onClose={onClose}><form className="dialogForm" onSubmit={async event => { event.preventDefault(); setBusy(true); setError(""); const form = new FormData(event.currentTarget); try { await onCreate(String(form.get("name") || "").trim(), String(form.get("description") || "").trim()); onClose(); } catch (caught: any) { setError(caught.message || "Grupul nu a putut fi creat."); } finally { setBusy(false); } }}><label>Numele grupului<input name="name" required placeholder="Familie, Gașca, Echipa…"/></label><label>Descriere<textarea name="description" placeholder="Despre ce este grupul?"/></label>{error && <p className="errorMessage">{error}</p>}<div className="formActions"><button type="button" className="secondary" onClick={onClose}>Renunță</button><button className="primary" disabled={busy}>{busy ? "Se creează…" : "Creează grup"}</button></div></form></DialogShell>;
}

function JoinGroupDialog({ initialCode, onClose, onJoin }: { initialCode: string; onClose: () => void; onJoin: (code: string) => Promise<void> }) {
  const [code, setCode] = useState(initialCode); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  return <DialogShell title="Intră într-un grup" eyebrow="AI PRIMIT O INVITAȚIE" onClose={onClose}><form className="dialogForm" onSubmit={async event => { event.preventDefault(); setBusy(true); setError(""); try { await onJoin(code); window.history.replaceState({}, "", window.location.pathname); onClose(); } catch (caught: any) { const message = caught?.message?.includes("function") ? "Funcția de invitații nu este instalată încă în Supabase. Rulează migrarea 003." : caught.message; setError(message || "Cod invalid sau expirat."); } finally { setBusy(false); } }}><label>Codul de invitație<div className="codeInput"><Link2/><input value={code} onChange={event => setCode(event.target.value.toUpperCase())} required autoFocus placeholder="EX: A1B2C3D4" maxLength={20}/></div></label><p className="fieldHint">Poți lipi codul primit sau poți deschide direct linkul de invitație.</p>{error && <p className="errorMessage">{error}</p>}<div className="formActions"><button type="button" className="secondary" onClick={onClose}>Renunță</button><button className="primary" disabled={busy}><UserPlus/> {busy ? "Se verifică…" : "Intră în grup"}</button></div></form></DialogShell>;
}

function InviteDialog({ group, inviteLink, onClose, notify }: { group: Group; inviteLink: string; onClose: () => void; notify: (message: string) => void }) {
  const copy = async (value: string, message: string) => { await navigator.clipboard.writeText(value); notify(message); };
  const share = async () => {
    const text = `Intră în grupul „${group.name}” din Circle Calendar. Cod: ${group.invite_code}`;
    if (navigator.share) await navigator.share({ title: `Invitație ${group.name}`, text, url: inviteLink });
    else await copy(`${text}\n${inviteLink}`, "Invitația a fost copiată.");
  };
  return <DialogShell title="Invită membri" eyebrow={group.name.toUpperCase()} onClose={onClose}><div className="inviteDialogBody"><div className="inviteCodeLarge"><small>CODUL GRUPULUI</small><strong>{group.invite_code}</strong></div><p>Oricine are acest cod sau link poate intra în grup. Trimite-l doar persoanelor pe care le cunoști.</p><div className="inviteActions"><button className="primary" onClick={() => void share()}><Share2/> Distribuie invitația</button><button className="secondary" onClick={() => void copy(group.invite_code, "Codul a fost copiat.")}><Clipboard/> Copiază codul</button><button className="secondary" onClick={() => void copy(inviteLink, "Linkul a fost copiat.")}><Link2/> Copiază linkul</button></div></div></DialogShell>;
}

function GroupsPage({ groups, activeGroupId, onSelect, onCreate, onJoin, onInvite }: { groups: Group[]; activeGroupId: string; onSelect: (id: string) => void; onCreate: () => void; onJoin: () => void; onInvite: (id: string) => void }) {
  const openGroup = (groupId: string) => { window.location.assign(`/groups/${groupId}`); };
  return <div className="page"><section className="pageTitle pageTitleActions"><div><small>CERCURILE TALE</small><h1>Grupuri</h1><p>Poți crea un grup, poți intra cu un cod și poți invita alte persoane. Apasă pe un grup pentru a deschide Group Hub.</p></div><div><button className="secondary" onClick={onJoin}><UserPlus/> Intră cu un cod</button><button className="primary" onClick={onCreate}><Plus/> Grup nou</button></div></section><div className="groupCards">{groups.map(group => <article key={group.id} className={`${group.id === activeGroupId ? "selectedGroup " : ""}selectableGroup`} onClick={() => openGroup(group.id)} onKeyDown={event => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) openGroup(group.id); }} role="link" tabIndex={0}><div className="groupIcon"><Users/></div><small>{group.id === activeGroupId ? "GRUP ACTIV" : "GRUP"}</small><h3>{group.name}</h3><p>{group.description || "Fără descriere"}</p><div className="groupCode"><span>Cod</span><code>{group.invite_code}</code></div><div className="cardActions"><button className="secondary" onClick={event => { event.stopPropagation(); onSelect(group.id); }}>{group.id === activeGroupId ? <><Check/> Activ</> : "Selectează"}</button><button className="primary" onClick={event => { event.stopPropagation(); onInvite(group.id); }}><Send/> Invită</button></div></article>)}</div></div>;
}

function SettingsPage({ profile, email, onSaved }: { profile: Profile; email: string; onSaved: () => Promise<void> }) {
  const { locale, setLocale, t } = useI18n();
  const [displayName, setDisplayName] = useState(profile.display_name || "");
  const [username, setUsername] = useState(profile.username || "");
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url || "");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState(profile.avatar_url || "");
  const [brand, setBrand] = useState<Brand>(profile.brand || "bros");
  const [theme, setTheme] = useState(profile.theme || "neon");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notificationPrefs, setNotificationPrefs] = useState<Pick<NotificationPreferences,"groups_enabled"|"events_enabled"|"quick_plans_enabled"|"vacations_enabled"|"reminders_enabled">>({
    groups_enabled:true,events_enabled:true,quick_plans_enabled:true,vacations_enabled:true,reminders_enabled:true,
  });

  useEffect(() => {
    void fetchNotificationPreferences(profile.id).then(values => setNotificationPrefs({
      groups_enabled:values.groups_enabled,events_enabled:values.events_enabled,
      quick_plans_enabled:values.quick_plans_enabled,vacations_enabled:values.vacations_enabled,
      reminders_enabled:values.reminders_enabled,
    })).catch(() => { /* migration may not be installed yet */ });
  }, [profile.id]);

  useEffect(() => () => {
    if (avatarPreview.startsWith("blob:")) URL.revokeObjectURL(avatarPreview);
  }, [avatarPreview]);

  useEffect(() => {
    const app = document.querySelector(".app");
    if (!app) return;
    const themeClasses = Array.from(app.classList).filter(className => className.startsWith("theme-"));
    app.classList.remove("bros", "girls", ...themeClasses);
    app.classList.add(brand, `theme-${theme}`);
  }, [brand, theme]);

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      let finalAvatarUrl = avatarUrl;
      if (avatarFile) {
        if (!avatarFile.type.startsWith("image/")) throw new Error("Alege un fișier imagine.");
        if (avatarFile.size > 5 * 1024 * 1024) throw new Error("Imaginea trebuie să fie mai mică de 5 MB.");
        const extension = avatarFile.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = `${profile.id}/avatar-${Date.now()}.${extension}`;
        const { error: uploadError } = await supabase.storage.from("avatars").upload(path, avatarFile, { upsert: true, contentType: avatarFile.type });
        if (uploadError) throw uploadError;
        finalAvatarUrl = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
      }
      const { error: updateError } = await supabase.from("profiles").update({
        display_name: displayName.trim(),
        username: username.trim() || null,
        avatar_url: finalAvatarUrl || null,
        brand,
        theme,
        locale
      }).eq("id", profile.id);
      if (updateError) throw updateError;
      await saveNotificationPreferences(profile.id, notificationPrefs);
      setAvatarUrl(finalAvatarUrl);
      setAvatarFile(null);
      await onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Setările nu au putut fi salvate.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="page settingsPage">
    <section className="settingsHero"><div><small>{t("settings.eyebrow")}</small><h1>{t("settings.title")}</h1><p>{t("settings.subtitle")}</p></div></section>
    <form className="settingsLayout" onSubmit={saveSettings}>
      <section className="profileEditorCard">
        <div className="avatarEditor">
          <div className="avatarLarge">{avatarPreview ? <img src={avatarPreview} alt="Avatar"/> : <span>{(displayName || username || "CC").slice(0,2).toUpperCase()}</span>}</div>
          <div><h2>{displayName || "Numele tău"}</h2><p>{email}</p><label className="avatarUpload"><Upload/> Încarcă fotografie<input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => { const file=event.target.files?.[0] || null; setAvatarFile(file); if (file) setAvatarPreview(URL.createObjectURL(file)); }}/></label><small>JPG, PNG sau WEBP, maximum 5 MB.</small></div>
        </div>
        <div className="settingsFields"><label>Nume afișat<input value={displayName} onChange={event => setDisplayName(event.target.value)} required/></label><label>Username<input value={username} onChange={event => setUsername(event.target.value)} placeholder="ionut"/></label></div>
      </section>

      <section className="appearanceCard">
        <div className="sectionHeading"><Settings/><div><small>ASPECT</small><h3>Alege stilul aplicației</h3></div></div>
        <div className="brandChoice"><button type="button" className={brand === "bros" ? "active" : ""} onClick={() => { setBrand("bros"); if (!["ocean","forest","emerald","lime","amber","copper","violet","graphite"].includes(theme)) setTheme("ocean"); }}><span>⚡</span><strong>Bro&apos;s</strong><small>Rece, sport și energic</small></button><button type="button" className={brand === "girls" ? "active" : ""} onClick={() => { setBrand("girls"); if (!["rose","pink","lavender","violet","coral","peach","berry","pearl"].includes(theme)) setTheme("rose"); }}><span>✨</span><strong>Girls&apos;</strong><small>Elegant, cald și pastel</small></button></div>
        <div className="accentPicker">
          <div className="accentPickerHeading"><div><small>CULOARE ACCENT</small><strong>{theme.charAt(0).toUpperCase() + theme.slice(1)}</strong></div><span>Se aplică instant în toată aplicația</span></div>
          <div className="accentRow" role="radiogroup" aria-label="Culoarea temei">
            {(brand === "bros" ? [
              {id:"ocean",name:"Ocean"}, {id:"forest",name:"Forest"}, {id:"emerald",name:"Emerald"}, {id:"lime",name:"Lime"},
              {id:"amber",name:"Amber"}, {id:"copper",name:"Copper"}, {id:"violet",name:"Violet"}, {id:"graphite",name:"Graphite"}
            ] : [
              {id:"rose",name:"Rose"}, {id:"pink",name:"Pink"}, {id:"lavender",name:"Lavender"}, {id:"violet",name:"Violet"},
              {id:"coral",name:"Coral"}, {id:"peach",name:"Peach"}, {id:"berry",name:"Berry"}, {id:"pearl",name:"Pearl"}
            ]).map(option => <button key={option.id} type="button" role="radio" aria-checked={theme===option.id} aria-label={option.name} title={option.name} className={`accentDot ${option.id}${theme===option.id?" active":""}`} onClick={()=>setTheme(option.id)}><span/>{theme===option.id&&<Check/>}</button>)}
          </div>
        </div>
      </section>

      <section className="appearanceCard languageSettingsCard">
        <div className="sectionHeading"><span aria-hidden="true">🌐</span><div><small>{t("language.eyebrow")}</small><h3>{t("language.title")}</h3></div></div>
        <p>{t("language.description")}</p>
        <div className="brandChoice languageChoice" role="radiogroup" aria-label={t("language.title")}>
          <button type="button" role="radio" aria-checked={locale === "ro"} className={locale === "ro" ? "active" : ""} onClick={() => setLocale("ro")}><span>🇷🇴</span><strong>{t("language.ro")}</strong></button>
          <button type="button" role="radio" aria-checked={locale === "en"} className={locale === "en" ? "active" : ""} onClick={() => setLocale("en")}><span>🇬🇧</span><strong>{t("language.en")}</strong></button>
        </div>
      </section>

      <section className="notificationSettingsCard">
        <div className="sectionHeading"><Bell/><div><small>NOTIFICĂRI</small><h3>Alege ce vrei să urmărești</h3></div></div>
        <p>Poți schimba oricând categoriile afișate în centrul de notificări.</p>
        <div className="notificationToggleList">
          {([
            ["groups_enabled","Invitații și grupuri","Membri noi și activitatea grupurilor"],
            ["events_enabled","Evenimente","Evenimente create, modificate sau anulate"],
            ["quick_plans_enabled","Quick Plan și voturi","Planuri, răspunsuri și comentarii"],
            ["vacations_enabled","Vacanțe","Perioade noi adăugate de membri"],
            ["reminders_enabled","Remindere","Evenimente apropiate și planuri fără răspuns"],
          ] as const).map(([key,title,description])=><label key={key}><span><strong>{title}</strong><small>{description}</small></span><input type="checkbox" checked={notificationPrefs[key]} onChange={event=>setNotificationPrefs(current=>({...current,[key]:event.target.checked}))}/><i/></label>)}
        </div>
      </section>

      <section className="mobileSignOutCard">
        <div><strong>{t("settings.signOut")}</strong><small>{t("settings.signOutHint")}</small></div>
        <button type="button" onClick={() => void supabase.auth.signOut()}><LogOut/> {t("settings.signOut")}</button>
      </section>

      <div className="settingsSaveBar">{error && <p className="errorMessage">{error}</p>}<button className="primary" disabled={busy}><Check/> {busy ? "Se salvează…" : "Salvează modificările"}</button></div>
    </form>
  </div>;
}

function CalendarPage({groupId,month,setMonth,events,vacations,profiles,participantCounts,onEvent,onVacation,onCreateDate}:{groupId:string;month:Date;setMonth:(date:Date)=>void;events:EventItem[];vacations:Vacation[];profiles:Record<string,Profile>;participantCounts:Record<string,number>;onEvent:(event:EventItem)=>void;onVacation:(vacation:Vacation)=>void;onCreateDate:(date:string)=>void}) {
  const { localeTag, t } = useI18n();
  const [compact, setCompact] = useState(false);
  const [sheetDate, setSheetDate] = useState("");
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [highlightedDate, setHighlightedDate] = useState("");
  const swipeStart = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const saved = window.localStorage.getItem("circle-calendar-compact");
    setCompact(saved ? saved === "true" : window.innerWidth < 700);
  }, []);
  const toggleCompact = () => setCompact(value => { const next=!value; window.localStorage.setItem("circle-calendar-compact",String(next)); return next; });
  const year=month.getFullYear(), currentMonth=month.getMonth();
  const firstDay=(new Date(year,currentMonth,1).getDay()+6)%7;
  const days=new Date(year,currentMonth+1,0).getDate();
  const cells=Array.from({length:42},(_,index)=>{const day=index-firstDay+1;return day>=1&&day<=days?day:null});
  const today=isoToday();
  const sheetEvents=events.filter(event=>event.event_date===sheetDate);
  const sheetVacations=vacations.filter(vacation=>vacation.start_date<=sheetDate&&vacation.end_date>=sheetDate);
  const orderedEvents = useMemo(() => navigableEvents(events, groupId), [events, groupId]);
  const futureEvents = useMemo(() => orderedEvents.filter(event => event.event_date >= isoToday()).slice(0, 50), [orderedEvents]);
  const monthNames = useMemo(() => Array.from({ length: 12 }, (_, value) =>
    new Intl.DateTimeFormat(localeTag, { month: "long" }).format(new Date(2026, value, 1))), [localeTag]);
  const currentYear = new Date().getFullYear();
  const eventYears = orderedEvents.map(event => Number(event.event_date.slice(0, 4)));
  const years = Array.from(new Set([
    ...Array.from({ length: 26 }, (_, index) => currentYear - 10 + index),
    ...eventYears,
  ])).sort((left, right) => left - right);
  const monthStart = `${year}-${String(currentMonth + 1).padStart(2, "0")}-01`;
  const monthEnd = `${year}-${String(currentMonth + 1).padStart(2, "0")}-${String(days).padStart(2, "0")}`;
  const previousEvent = previousCalendarEvent(orderedEvents, monthStart);
  const isViewingFutureMonth = monthStart.slice(0, 7) > isoToday().slice(0, 7);
  const nextEvent = isViewingFutureMonth
    ? nextCalendarEvent(orderedEvents, monthEnd)
    : futureEvents[0] || null;

  const navigateToMonth = useCallback((targetYear: number, targetMonth: number) => {
    setMonth(new Date(targetYear, targetMonth, 1));
  }, [setMonth]);

  const navigateToDate = useCallback((date: string) => {
    const parsed = new Date(`${date}T12:00:00`);
    navigateToMonth(parsed.getFullYear(), parsed.getMonth());
    setHighlightedDate(date);
    window.setTimeout(() => setHighlightedDate(current => current === date ? "" : current), 1800);
  }, [navigateToMonth]);

  const navigateToEvent = useCallback((event: EventItem) => {
    const target = eventNavigationTarget(event);
    setMonth(target.visibleMonth);
    setSelectedEventId(target.selectedEventId);
    setHighlightedDate(target.selectedDate);
    setNavigationOpen(false);
    window.setTimeout(() => setHighlightedDate(current => current === target.selectedDate ? "" : current), 1800);
    if (window.innerWidth < 1024) setSheetDate(target.selectedDate);
    else window.setTimeout(() => onEvent(event), 80);
  }, [onEvent, setMonth]);

  useEffect(() => {
    if (!navigationOpen) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setNavigationOpen(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [navigationOpen]);

  useEffect(() => {
    if (!highlightedDate) return;
    const frame = window.requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>(`[data-calendar-date="${highlightedDate}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [highlightedDate, month]);
  return <><div className="page"><section className={`calendarPanel ${compact?"compactCalendar":"largeCalendar"}`} onTouchStart={event=>{swipeStart.current={x:event.touches[0].clientX,y:event.touches[0].clientY}}} onTouchEnd={event=>{const dx=event.changedTouches[0].clientX-swipeStart.current.x;const dy=event.changedTouches[0].clientY-swipeStart.current.y;if(Math.abs(dx)>70&&Math.abs(dx)>Math.abs(dy)*1.3)navigateToMonth(year,currentMonth+(dx<0?1:-1))}}>
    <header className="calendarHeader">
      <div><small>{t("calendar.eyebrow")}</small><h1>{monthTitle(month, localeTag)}</h1></div>
      <button className="mobileCalendarNavigationButton" onClick={()=>setNavigationOpen(true)} aria-label={t("calendar.navigation")}><Compass/> {t("calendar.navigation")}</button>
      <div className="calendarDesktopNavigation">
        <label><span className="srOnly">{t("calendar.selectMonth")}</span><select aria-label={t("calendar.selectMonth")} value={currentMonth} onChange={event=>navigateToMonth(year,Number(event.target.value))}>{monthNames.map((name,index)=><option value={index} key={name}>{name}</option>)}</select></label>
        <label><span className="srOnly">{t("calendar.selectYear")}</span><select aria-label={t("calendar.selectYear")} value={year} onChange={event=>navigateToMonth(Number(event.target.value),currentMonth)}>{years.map(value=><option value={value} key={value}>{value}</option>)}</select></label>
        <div className="calendarEventSelector">
          <button disabled={!nextEvent} onClick={()=>nextEvent&&navigateToEvent(nextEvent)}><CalendarDays/> {t("calendar.nextEvent")}</button>
          <select aria-label={t("calendar.futureEvents")} defaultValue="" disabled={!futureEvents.length} onChange={event=>{const selected=futureEvents.find(item=>item.id===event.target.value);if(selected)navigateToEvent(selected);event.currentTarget.value="";}}>
            <option value="">{futureEvents.length?t("calendar.goToEvent"):t("calendar.noFutureEvents")}</option>
            {futureEvents.map(item=><option value={item.id} key={item.id}>{new Date(`${item.event_date}T12:00:00`).toLocaleDateString(localeTag,{day:"numeric",month:"short"})} · {item.title}</option>)}
          </select>
        </div>
        <button className="iconButton" title={t("calendar.previousEvent")} aria-label={t("calendar.previousEvent")} disabled={!previousEvent} onClick={()=>previousEvent&&navigateToEvent(previousEvent)}><SkipBack/></button>
        <button className="iconButton" title={t("calendar.nextEvent")} aria-label={t("calendar.nextEvent")} disabled={!nextEvent} onClick={()=>nextEvent&&navigateToEvent(nextEvent)}><SkipForward/></button>
        <button className="calendarTodayButton" onClick={()=>navigateToDate(isoToday())}>{t("common.today")}</button>
        <button className="iconButton" aria-label={t("calendar.previousMonth")} onClick={()=>navigateToMonth(year,currentMonth-1)}><ChevronLeft/></button>
        <button className="iconButton" aria-label={t("calendar.nextMonth")} onClick={()=>navigateToMonth(year,currentMonth+1)}><ChevronRight/></button>
        <button className="calendarSizeButton" onClick={toggleCompact} title={compact?t("calendar.expand"):t("calendar.compact")}>{compact?<Maximize2/>:<Minimize2/>}<span>{compact?t("calendar.large"):t("calendar.compact")}</span></button>
      </div>
    </header>
    <p className="calendarHint">{t("calendar.hint")}</p><div className="calendarViewport"><div className="weekDays">{Array.from({length:7},(_,index)=>new Intl.DateTimeFormat(localeTag,{weekday:"short"}).format(new Date(2026,5,index+1)).slice(0,2)).map(day=><span key={day}>{day}</span>)}</div><div className="calendarGrid">{cells.map((day,index)=>{
    const date=day?`${year}-${String(currentMonth+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`:"";
    const dayEvents=events.filter(event=>event.event_date===date);
    const dayVacations=vacations.filter(vacation=>vacation.start_date<=date&&vacation.end_date>=date);
    const itemCount=dayEvents.length+dayVacations.length;
    const openDay=()=>{if(!day)return;if(typeof window!=="undefined"&&window.innerWidth<1024&&itemCount)setSheetDate(date);else onCreateDate(date)};
    return <div key={index} data-calendar-date={date||undefined} aria-current={date===today?"date":undefined} aria-selected={date===highlightedDate||undefined} className={`${!day?"day muted":"day"}${date===today?" todayGlow":""}${date===highlightedDate?" eventJumpHighlight":""}`} onClick={openDay} role={day?"button":undefined} tabIndex={day?0:undefined} onKeyDown={event=>{if(day&&(event.key==="Enter"||event.key===" "))openDay()}}>
      <b>{day}</b>
      {dayEvents.map(event=>{const owner=profiles[event.created_by];return <button aria-pressed={event.id===selectedEventId} className={`smartCalendarCard eventCalendarCard${event.id===selectedEventId?" selectedCalendarEvent":""}`} key={event.id} onClick={click=>{click.stopPropagation();navigateToEvent(event)}}>
        <CalendarAvatar profile={owner}/>
        <span className="calendarCardText"><strong>{event.title}</strong><small>{profileName(owner)}</small></span>
        <span className="calendarCompactIcon">●</span>
        <CalendarTooltip type="event" title={event.title} profile={owner} location={event.location} participantCount={participantCounts[event.id]||1}/>
      </button>})}
      {dayVacations.map(vacation=>{const owner=profiles[vacation.user_id];return <button className="calendarVacation smartCalendarCard" key={vacation.id} onClick={click=>{click.stopPropagation();onVacation(vacation)}}>
        <CalendarAvatar profile={owner}/>
        <span className="calendarCardText"><strong><Plane/> {vacation.country}</strong><small>{profileName(owner)}</small></span>
        <span className="calendarCompactIcon"><Plane/></span>
        <CalendarTooltip type="vacation" profile={owner} location={vacation.country} startDate={vacation.start_date} endDate={vacation.end_date}/>
      </button>})}
      {itemCount>2&&<button className="calendarMoreButton" onClick={click=>{click.stopPropagation();setSheetDate(date)}}>+{itemCount-2}</button>}
    </div>;
  })}</div></div></section>
  {sheetDate&&<div className="mobileSheetBack calendarDaySheetBack" onMouseDown={event=>{if(event.target===event.currentTarget)setSheetDate("")}}><section className="calendarDaySheet"><span className="sheetHandle"/><header><div><small>AGENDA ZILEI</small><h2>{new Date(`${sheetDate}T12:00:00`).toLocaleDateString("ro-RO",{weekday:"long",day:"numeric",month:"long"})}</h2></div><button className="iconButton" onClick={()=>setSheetDate("")}><X/></button></header><div className="calendarDayItems">{sheetEvents.map(event=><button key={event.id} onClick={()=>{setSheetDate("");onEvent(event)}}><CalendarAvatar profile={profiles[event.created_by]}/><div><strong>{event.title}</strong><span>{event.event_time?.slice(0,5)||"Toată ziua"} · {event.location||"Fără locație"}</span></div><ChevronRight/></button>)}{sheetVacations.map(vacation=><button key={vacation.id} onClick={()=>{setSheetDate("");onVacation(vacation)}}><CalendarAvatar profile={profiles[vacation.user_id]}/><div><strong>✈ {vacation.country}</strong><span>{profileName(profiles[vacation.user_id])}</span></div><ChevronRight/></button>)}</div><button className="primary calendarDayAdd" onClick={()=>{setSheetDate("");onCreateDate(sheetDate)}}><Plus/> Eveniment nou</button></section></div>}
  </div>
  {navigationOpen&&<div className="mobileSheetBack calendarNavigationBack" onMouseDown={event=>{if(event.target===event.currentTarget)setNavigationOpen(false)}}><section className="calendarNavigationSheet" aria-label={t("calendar.navigation")}><span className="sheetHandle"/><header><div><small>{t("calendar.eyebrow")}</small><h2>{t("calendar.navigation")}</h2></div><button className="iconButton" aria-label={t("common.cancel")} onClick={()=>setNavigationOpen(false)}><X/></button></header><div className="calendarNavigationFields"><label>{t("calendar.selectMonth")}<select value={currentMonth} onChange={event=>navigateToMonth(year,Number(event.target.value))}>{monthNames.map((name,index)=><option value={index} key={name}>{name}</option>)}</select></label><label>{t("calendar.selectYear")}<select value={year} onChange={event=>navigateToMonth(Number(event.target.value),currentMonth)}>{years.map(value=><option value={value} key={value}>{value}</option>)}</select></label></div><div className="calendarNavigationActions"><button onClick={()=>{navigateToDate(isoToday());setNavigationOpen(false)}}><CalendarDays/> {t("common.today")}</button><button disabled={!previousEvent} onClick={()=>previousEvent&&navigateToEvent(previousEvent)}><SkipBack/> {t("calendar.previousEvent")}</button><button disabled={!nextEvent} onClick={()=>nextEvent&&navigateToEvent(nextEvent)}><SkipForward/> {t("calendar.nextEvent")}</button></div><div className="calendarFutureEvents"><h3>{t("calendar.futureEvents")}</h3>{futureEvents.length?futureEvents.map(item=><button key={item.id} aria-pressed={item.id===selectedEventId} onClick={()=>navigateToEvent(item)}><time>{new Date(`${item.event_date}T12:00:00`).toLocaleDateString(localeTag,{day:"numeric",month:"short"})}</time><span><strong>{item.title}</strong><small>{t("calendar.oneDayEvent")}</small></span><ChevronRight/></button>):<p>{t("calendar.noFutureEvents")}</p>}</div></section></div>}
  </>;
}

function profileName(profile?: Profile) {
  return profile?.display_name || profile?.username || "Membru";
}

function profileInitials(profile?: Profile) {
  return profileName(profile).split(/\s+/).map(part => part[0]).join("").slice(0,2).toUpperCase();
}

function CalendarAvatar({ profile }: { profile?: Profile }) {
  return <span className="calendarAvatar">{profile?.avatar_url ? <img src={profile.avatar_url} alt=""/> : profileInitials(profile)}</span>;
}

function CalendarTooltip({type,title,profile,location,participantCount,startDate,endDate}:{type:"event"|"vacation";title?:string;profile?:Profile;location:string;participantCount?:number;startDate?:string;endDate?:string}) {
  return <span className="calendarTooltip" role="tooltip">
    <span className="tooltipOwner"><CalendarAvatar profile={profile}/><strong>{profileName(profile)}</strong></span>
    {type==="event"?<><span>🍖 <strong>{title}</strong></span><span>👤 Organizator: {profileName(profile)}</span><span>📍 {location||"Fără locație"}</span><span>👥 {participantCount} {participantCount===1?"participant":"participanți"}</span></>:<><span>✈ <strong>Vacanță</strong></span><span>📍 {location}</span><span>📅 {startDate&&endDate?`${formatDate(startDate)} – ${formatDate(endDate)}`:""}</span></>}
  </span>;
}
