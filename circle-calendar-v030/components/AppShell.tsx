"use client";

import { Bell, CalendarDays, Camera, ChevronLeft, ChevronRight, Home, Images, LogOut, Menu, Plus, RefreshCw, Users, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { EventItem, EventMedia, Group, Profile } from "@/types/database";
import { EventModal } from "./EventModal";

function isoToday() { return new Date().toISOString().slice(0, 10); }
function monthTitle(date: Date) { return date.toLocaleDateString("ro-RO", { month: "long", year: "numeric" }); }
function formatDate(value: string) { return new Date(`${value}T12:00:00`).toLocaleDateString("ro-RO", { day: "numeric", month: "long" }); }

export function AppShell({ session }: { session: Session }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [activeGroupId, setActiveGroupId] = useState("");
  const [events, setEvents] = useState<EventItem[]>([]);
  const [allMedia, setAllMedia] = useState<EventMedia[]>([]);
  const [view, setView] = useState<"home" | "calendar" | "media" | "groups">("home");
  const [month, setMonth] = useState(new Date());
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async () => {
    const { data } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
    setProfile(data as Profile | null);
  }, [session.user.id]);

  const loadGroups = useCallback(async () => {
    const { data, error } = await supabase.from("group_members").select("groups(*)").eq("user_id", session.user.id);
    if (error) { console.error(error); return; }
    const rows = (data || []).map((row: any) => row.groups).filter(Boolean) as Group[];
    setGroups(rows);
    setActiveGroupId(current => current || rows[0]?.id || "");
  }, [session.user.id]);

  const loadEvents = useCallback(async () => {
    if (!activeGroupId) { setEvents([]); return; }
    const { data, error } = await supabase.from("events").select("*").eq("group_id", activeGroupId).order("event_date");
    if (error) console.error(error);
    setEvents((data || []) as EventItem[]);
  }, [activeGroupId]);

  const loadMedia = useCallback(async () => {
    if (!activeGroupId) { setAllMedia([]); return; }
    const { data } = await supabase.from("event_media").select("*").eq("group_id", activeGroupId).order("created_at", { ascending: false });
    const rows = (data || []) as EventMedia[];
    const signed = await Promise.all(rows.map(async item => {
      const { data: signedData } = await supabase.storage.from("event-media").createSignedUrl(item.storage_path, 3600);
      return { ...item, signed_url: signedData?.signedUrl };
    }));
    setAllMedia(signed);
  }, [activeGroupId]);

  useEffect(() => { void Promise.all([loadProfile(), loadGroups()]).finally(() => setLoading(false)); }, [loadProfile, loadGroups]);
  useEffect(() => { void loadEvents(); void loadMedia(); }, [loadEvents, loadMedia]);
  useEffect(() => {
    if (!activeGroupId) return;
    const channel = supabase.channel(`circle-${activeGroupId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "events", filter: `group_id=eq.${activeGroupId}` }, () => void loadEvents())
      .on("postgres_changes", { event: "*", schema: "public", table: "event_media", filter: `group_id=eq.${activeGroupId}` }, () => void loadMedia())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [activeGroupId, loadEvents, loadMedia]);

  async function createGroup(name: string) {
    const { data, error } = await supabase.from("groups").insert({ name, description: "Primul meu grup", owner_id: session.user.id }).select().single();
    if (error) return alert(error.message);
    await loadGroups();
    setActiveGroupId(data.id);
  }

  const upcoming = useMemo(() => events.filter(e => e.event_date >= isoToday()).slice(0, 5), [events]);
  const activeGroup = groups.find(g => g.id === activeGroupId);
  const eventById = useMemo(() => new Map(events.map(e => [e.id, e])), [events]);

  if (loading) return <main className="loadingPage"><RefreshCw className="spin"/> Se conectează la Circle Calendar…</main>;
  if (!groups.length) return <main className="onboarding"><section><span>👋</span><h1>Bun venit, {profile?.display_name || "prietene"}</h1><p>Creează primul grup. Vei putea invita prietenii după aceea.</p><form onSubmit={e => {e.preventDefault(); const input = new FormData(e.currentTarget).get("name")?.toString().trim(); if (input) void createGroup(input);}}><input name="name" placeholder="Prieteni, Familie, Echipa…" required/><button className="primary">Creează grupul</button></form><button className="textButton" onClick={() => supabase.auth.signOut()}>Log out</button></section></main>;

  return <main className={`app ${profile?.brand || "bros"}`}>
    <aside className={menuOpen ? "sidebar open" : "sidebar"}>
      <div className="sideLogo"><span>CC</span><div><strong>Circle Calendar</strong><small>PLAN. SHARE. REMEMBER.</small></div><button className="mobileClose" onClick={() => setMenuOpen(false)}><X/></button></div>
      <label className="groupPicker">GRUP ACTIV<select value={activeGroupId} onChange={e => setActiveGroupId(e.target.value)}>{groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
      <nav>{[["home","Acasă",Home],["calendar","Calendar",CalendarDays],["media","Amintiri",Images],["groups","Grupuri",Users]].map(([id,label,Icon]: any) => <button key={id} className={view === id ? "active" : ""} onClick={() => {setView(id);setMenuOpen(false);}}><Icon/>{label}</button>)}</nav>
      <div className="inviteBox"><small>COD INVITAȚIE</small><strong>{activeGroup?.invite_code}</strong></div>
      <button className="logout" onClick={() => supabase.auth.signOut()}><LogOut/> Log out</button>
    </aside>

    <section className="mainContent">
      <header className="topbar"><button className="menuToggle" onClick={() => setMenuOpen(true)}><Menu/></button><div><small>{activeGroup?.name}</small><h2>{view === "home" ? "Acasă" : view === "media" ? "Amintiri" : view === "groups" ? "Grupuri" : "Calendar"}</h2></div><div className="topActions"><button className="iconButton"><Bell/></button><button className="primary compact" onClick={() => {setSelectedEvent(null);setModalOpen(true);}}><Plus/> Eveniment</button></div></header>

      {view === "home" && <div className="page"><section className="welcome"><div><small>BINE AI REVENIT</small><h1>Salut, {profile?.display_name || profile?.username || "prietene"} 👋</h1><p>Următorul eveniment, albumele recente și grupul tău sunt aici.</p></div><button className="primary" onClick={() => {setSelectedEvent(null);setModalOpen(true);}}><Plus/> Creează eveniment</button></section><div className="dashboardGrid"><section className="panel"><header><div><small>URMEAZĂ</small><h3>Evenimente viitoare</h3></div><button onClick={() => setView("calendar")}>Vezi calendarul</button></header>{upcoming.length ? upcoming.map(event => <button className="eventListRow" key={event.id} onClick={() => {setSelectedEvent(event);setModalOpen(true);}}><span className="dateBox"><b>{new Date(`${event.event_date}T12:00:00`).getDate()}</b><small>{new Date(`${event.event_date}T12:00:00`).toLocaleDateString("ro-RO",{month:"short"})}</small></span><span><strong>{event.title}</strong><small>{event.event_time?.slice(0,5) || "Fără oră"} · {event.location || "Fără locație"}</small></span></button>) : <div className="emptyState">Nu ai evenimente viitoare.</div>}</section><section className="panel memoryPreview"><header><div><small>ALBUME</small><h3>Media recentă</h3></div><button onClick={() => setView("media")}>Vezi toate</button></header><div className="miniMediaGrid">{allMedia.slice(0,6).map(item => item.mime_type.startsWith("video/") ? <video key={item.id} src={item.signed_url}/> : <img key={item.id} src={item.signed_url} alt=""/> )}</div>{!allMedia.length && <div className="emptyState"><Camera/> Pozele vor apărea aici după ce le adaugi într-un eveniment.</div>}</section></div></div>}

      {view === "calendar" && <CalendarPage month={month} setMonth={setMonth} events={events} onEvent={event => {setSelectedEvent(event);setModalOpen(true);}}/>}
      {view === "media" && <div className="page"><section className="pageTitle"><small>CIRCLE MEMORIES</small><h1>Arhiva evenimentelor</h1><p>Fiecare album este creat automat din media încărcată în evenimente.</p></section><div className="albumCards">{events.filter(e => allMedia.some(m => m.event_id === e.id)).map(event => {const items=allMedia.filter(m => m.event_id===event.id);return <button key={event.id} className="albumCard" onClick={() => {setSelectedEvent(event);setModalOpen(true);}}><div className="albumCover">{items[0]?.mime_type.startsWith("video/") ? <video src={items[0]?.signed_url}/> : <img src={items[0]?.signed_url} alt=""/>}<span>{items.length}</span></div><div><strong>{event.title}</strong><small>{formatDate(event.event_date)} · {items.filter(x=>x.mime_type.startsWith("image/")).length} poze · {items.filter(x=>x.mime_type.startsWith("video/")).length} video</small></div></button>})}</div>{!allMedia.length && <div className="largeEmpty"><Images/><h3>Arhiva este goală</h3><p>Deschide un eveniment și adaugă poze sau videoclipuri.</p></div>}</div>}
      {view === "groups" && <div className="page"><section className="pageTitle"><small>CERCURILE TALE</small><h1>Grupuri</h1></section><div className="groupCards">{groups.map(group => <article key={group.id}><Users/><h3>{group.name}</h3><p>{group.description}</p><code>{group.invite_code}</code></article>)}</div></div>}
    </section>

    <nav className="mobileNav"><button className={view==="home"?"active":""} onClick={()=>setView("home")}><Home/><span>Acasă</span></button><button className={view==="calendar"?"active":""} onClick={()=>setView("calendar")}><CalendarDays/><span>Calendar</span></button><button className="mobilePlus" onClick={()=>{setSelectedEvent(null);setModalOpen(true);}}><Plus/></button><button className={view==="media"?"active":""} onClick={()=>setView("media")}><Images/><span>Amintiri</span></button><button className={view==="groups"?"active":""} onClick={()=>setView("groups")}><Users/><span>Grupuri</span></button></nav>

    {modalOpen && <EventModal event={selectedEvent} groupId={activeGroupId} userId={session.user.id} onClose={() => setModalOpen(false)} onSaved={async () => {await loadEvents();await loadMedia();}} onDeleted={async () => {await loadEvents();await loadMedia();}}/>}
  </main>;
}

function CalendarPage({month,setMonth,events,onEvent}:{month:Date;setMonth:(d:Date)=>void;events:EventItem[];onEvent:(e:EventItem)=>void}) {
  const year=month.getFullYear(), m=month.getMonth();
  const firstDay=(new Date(year,m,1).getDay()+6)%7;
  const days=new Date(year,m+1,0).getDate();
  const cells=Array.from({length:42},(_,i)=>{const day=i-firstDay+1;return day>=1&&day<=days?day:null});
  return <div className="page"><section className="calendarPanel"><header className="calendarHeader"><div><small>CALENDAR</small><h1>{monthTitle(month)}</h1></div><div><button className="iconButton" onClick={()=>setMonth(new Date(year,m-1,1))}><ChevronLeft/></button><button onClick={()=>setMonth(new Date())}>Astăzi</button><button className="iconButton" onClick={()=>setMonth(new Date(year,m+1,1))}><ChevronRight/></button></div></header><div className="weekDays">{["L","Ma","Mi","J","V","S","D"].map(x=><span key={x}>{x}</span>)}</div><div className="calendarGrid">{cells.map((day,index)=>{const date=day?`${year}-${String(m+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`:"";const dayEvents=events.filter(e=>e.event_date===date);return <div key={index} className={!day?"day muted":"day"}><b>{day}</b>{dayEvents.map(event=><button key={event.id} onClick={()=>onEvent(event)}><strong>{event.title}</strong><small>{event.event_time?.slice(0,5)}</small></button>)}</div>})}</div></section></div>;
}
