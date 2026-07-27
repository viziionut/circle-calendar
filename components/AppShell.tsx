"use client";

import {
  Bell, CalendarDays, Camera, Check, ChevronLeft, ChevronRight, Clipboard, Upload, Maximize2, Minimize2,
  Home, Images, Link2, LogOut, Menu, Plane, Plus, RefreshCw, Send, Settings,
  Share2, UserCircle, UserPlus, Users, X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { Brand, EventItem, EventMedia, Group, Profile, Vacation } from "@/types/database";
import { EventModal } from "./EventModal";
import { VacationsPage } from "./VacationsPage";
import { AdminNavItem } from "./admin/AdminNavItem";
import { PendingQuickPlans } from "./quick-plan/QuickPlan";

type View = "home" | "calendar" | "vacations" | "media" | "groups" | "settings";
type Dialog = "create" | "join" | "invite" | null;

function isoToday() { return new Date().toISOString().slice(0, 10); }
function monthTitle(date: Date) { return date.toLocaleDateString("ro-RO", { month: "long", year: "numeric" }); }
function formatDate(value: string) { return new Date(`${value}T12:00:00`).toLocaleDateString("ro-RO", { day: "numeric", month: "long" }); }
function normaliseCode(value: string) { return value.trim().toUpperCase().replace(/\s+/g, ""); }

export function AppShell({ session }: { session: Session }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [activeGroupId, setActiveGroupId] = useState("");
  const [events, setEvents] = useState<EventItem[]>([]);
  const [vacations, setVacations] = useState<Vacation[]>([]);
  const [vacationMemberNames, setVacationMemberNames] = useState<Record<string, string>>({});
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

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }, []);

  const loadProfile = useCallback(async () => {
    const { data, error } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
    if (error) console.error(error);
    setProfile(data as Profile | null);
  }, [session.user.id]);

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
    setEvents((data || []) as EventItem[]);
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

  if (loading) return <main className="loadingPage"><RefreshCw className="spin"/> Se conectează la Circle Calendar…</main>;

  if (!groups.length) return <main className={`onboarding ${profile?.brand || "bros"}`}>
    <section className="onboardingCard">
      <span className="onboardingLogo">CC</span>
      <small>CIRCLE CALENDAR v5.5</small>
      <h1>Bun venit, {profile?.display_name || "prietene"}</h1>
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

  const pageTitle = view === "home" ? "Acasă" : view === "vacations" ? "Vacanțe" : view === "media" ? "Amintiri" : view === "groups" ? "Grupuri" : view === "settings" ? "Setări" : "Calendar";

  return <main className={`app ${profile?.brand || "bros"} theme-${profile?.theme || "neon"}`}>
    <aside className={menuOpen ? "sidebar open" : "sidebar"}>
      <div className="sideLogo"><span>CC</span><div><strong>Circle Calendar <em className="versionBadge">v5.5</em></strong><small>PLAN. SHARE. REMEMBER.</small></div><button className="mobileClose" onClick={() => setMenuOpen(false)}><X/></button></div>
      <label className="groupPicker">GRUP ACTIV<select value={activeGroupId} onChange={event => setActiveGroupId(event.target.value)}>{groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
      <nav>
        <button className={view === "home" ? "active" : ""} onClick={() => openView("home")}><Home/>Acasă</button>
        <button className={view === "calendar" ? "active" : ""} onClick={() => openView("calendar")}><CalendarDays/>Calendar</button>
        <button className={view === "vacations" ? "active" : ""} onClick={() => openView("vacations")}><Plane/>Vacanțe</button>
        <button className={view === "media" ? "active" : ""} onClick={() => openView("media")}><Images/>Amintiri</button>
        <button className={view === "groups" ? "active" : ""} onClick={() => openView("groups")}><Users/>Grupuri</button>
        <div className="navDivider"/>
        <button onClick={() => { setDialog("join"); setMenuOpen(false); }}><UserPlus/>Intră într-un grup</button>
        <button onClick={() => { setDialog("invite"); setMenuOpen(false); }}><Send/>Invită membri</button>
        <button className={view === "settings" ? "active" : ""} onClick={() => openView("settings")}><Settings/>Setări cont</button>
        <AdminNavItem onNavigate={() => setMenuOpen(false)}/>
      </nav>
      <button className="inviteBox" onClick={() => setDialog("invite")}><small>COD INVITAȚIE</small><strong>{activeGroup?.invite_code}</strong><span><Share2/> Invită</span></button>
      <button className="logout" onClick={() => supabase.auth.signOut()}><LogOut/> Log out</button>
    </aside>

    <section className="mainContent">
      <header className="topbar"><button className="menuToggle" onClick={() => setMenuOpen(true)}><Menu/></button><div><small>{activeGroup?.name}</small><h2>{pageTitle}</h2></div><div className="topActions"><button className="iconButton"><Bell/></button><button className="primary compact" onClick={() => {setSelectedEvent(null);setSelectedDate(isoToday());setModalOpen(true);}}><Plus/> Eveniment</button></div></header>

      {view === "home" && <div className="page"><section className="welcome"><div><small>BINE AI REVENIT</small><h1>Salut, {profile?.display_name || profile?.username || "prietene"} 👋</h1><p>Următorul eveniment, albumele recente și grupul tău sunt aici.</p></div><button className="primary" onClick={() => {setSelectedEvent(null);setSelectedDate(isoToday());setModalOpen(true);}}><Plus/> Creează eveniment</button></section><div className="dashboardGrid"><PendingQuickPlans groups={groups} currentUserId={session.user.id}/><section className="panel"><header><div><small>URMEAZĂ</small><h3>Evenimente viitoare</h3></div><button onClick={() => setView("calendar")}>Vezi calendarul</button></header>{upcoming.length ? upcoming.map(event => <button className="eventListRow" key={event.id} onClick={() => {setSelectedEvent(event);setModalOpen(true);}}><span className="dateBox"><b>{new Date(`${event.event_date}T12:00:00`).getDate()}</b><small>{new Date(`${event.event_date}T12:00:00`).toLocaleDateString("ro-RO",{month:"short"})}</small></span><span><strong>{event.title}</strong><small>{event.event_time?.slice(0,5) || "Fără oră"} · {event.location || "Fără locație"}</small></span></button>) : <div className="emptyState">Nu ai evenimente viitoare.</div>}</section><section className="panel memoryPreview"><header><div><small>ALBUME</small><h3>Media recentă</h3></div><button onClick={() => setView("media")}>Vezi toate</button></header><div className="miniMediaGrid">{allMedia.slice(0,6).map(item => item.mime_type.startsWith("video/") ? <video key={item.id} src={item.signed_url}/> : <img key={item.id} src={item.signed_url} alt=""/> )}</div>{!allMedia.length && <div className="emptyState"><Camera/> Pozele vor apărea aici după ce le adaugi într-un eveniment.</div>}</section></div></div>}

      {view === "calendar" && <CalendarPage month={month} setMonth={setMonth} events={events} vacations={vacations} onEvent={event => {setSelectedEvent(event);setSelectedDate(event.event_date);setModalOpen(true);}} onVacation={() => setView("vacations")} onCreateDate={date => {setSelectedEvent(null);setSelectedDate(date);setModalOpen(true);}}/>}
      {view === "vacations" && <VacationsPage vacations={vacations} groupId={activeGroupId} userId={session.user.id} memberNames={vacationMemberNames} onChanged={loadVacations}/>}
      {view === "media" && <div className="page"><section className="pageTitle"><small>CIRCLE MEMORIES</small><h1>Arhiva evenimentelor</h1><p>Fiecare album este creat automat din media încărcată în evenimente.</p></section><div className="albumCards">{events.filter(event => allMedia.some(media => media.event_id === event.id)).map(event => {const items=allMedia.filter(media => media.event_id===event.id);return <button key={event.id} className="albumCard" onClick={() => {setSelectedEvent(event);setModalOpen(true);}}><div className="albumCover">{items[0]?.mime_type.startsWith("video/") ? <video src={items[0]?.signed_url}/> : <img src={items[0]?.signed_url} alt=""/>}<span>{items.length}</span></div><div><strong>{event.title}</strong><small>{formatDate(event.event_date)} · {items.filter(item=>item.mime_type.startsWith("image/")).length} poze · {items.filter(item=>item.mime_type.startsWith("video/")).length} video</small></div></button>})}</div>{!allMedia.length && <div className="largeEmpty"><Images/><h3>Arhiva este goală</h3><p>Deschide un eveniment și adaugă poze sau videoclipuri.</p></div>}</div>}
      {view === "groups" && <GroupsPage groups={groups} activeGroupId={activeGroupId} onSelect={setActiveGroupId} onCreate={() => setDialog("create")} onJoin={() => setDialog("join")} onInvite={(groupId) => { setActiveGroupId(groupId); setDialog("invite"); }}/>} 
      {view === "settings" && profile && <SettingsPage profile={profile} email={session.user.email || ""} onSaved={async () => { await loadProfile(); notify("Setările au fost salvate."); }}/>} 
    </section>

    <nav className="mobileNav"><button className={view==="home"?"active":""} onClick={()=>setView("home")}><Home/><span>Acasă</span></button><button className={view==="calendar"?"active":""} onClick={()=>setView("calendar")}><CalendarDays/><span>Calendar</span></button><button className="mobilePlus" onClick={()=>{setSelectedEvent(null);setSelectedDate(isoToday());setModalOpen(true);}}><Plus/></button><button className={view==="media"?"active":""} onClick={()=>setView("media")}><Images/><span>Amintiri</span></button><button className={view==="settings"?"active":""} onClick={()=>setView("settings")}><Settings/><span>Setări</span></button></nav>

    {modalOpen && <EventModal event={selectedEvent} initialDate={selectedDate || isoToday()} groupId={activeGroupId} userId={session.user.id} onClose={() => setModalOpen(false)} onSaved={async () => {await loadEvents();await loadMedia();}} onDeleted={async () => {await loadEvents();await loadMedia();}}/>}
    {dialog === "create" && <CreateGroupDialog onClose={() => setDialog(null)} onCreate={createGroup}/>} 
    {dialog === "join" && <JoinGroupDialog initialCode={typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("invite") || "" : ""} onClose={() => setDialog(null)} onJoin={joinGroup}/>} 
    {dialog === "invite" && activeGroup && <InviteDialog group={activeGroup} inviteLink={inviteLink} onClose={() => setDialog(null)} notify={notify}/>} 
    {toast && <div className="toast"><Check/> {toast}</div>}
  </main>;
}

function DialogShell({ title, eyebrow, onClose, children }: { title: string; eyebrow: string; onClose: () => void; children: ReactNode }) {
  return <div className="modalBack" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section className="smallModal"><header className="modalHeader"><div><small>{eyebrow}</small><h2>{title}</h2></div><button className="iconButton" onClick={onClose}><X/></button></header>{children}</section></div>;
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
  const [displayName, setDisplayName] = useState(profile.display_name || "");
  const [username, setUsername] = useState(profile.username || "");
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url || "");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState(profile.avatar_url || "");
  const [brand, setBrand] = useState<Brand>(profile.brand || "bros");
  const [theme, setTheme] = useState(profile.theme || "neon");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
        theme
      }).eq("id", profile.id);
      if (updateError) throw updateError;
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
    <section className="settingsHero"><div><small>CONTUL TĂU</small><h1>Profil și aspect</h1><p>Schimbările de aspect se văd imediat după salvare.</p></div></section>
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

      <div className="settingsSaveBar">{error && <p className="errorMessage">{error}</p>}<button className="primary" disabled={busy}><Check/> {busy ? "Se salvează…" : "Salvează modificările"}</button></div>
    </form>
  </div>;
}

function CalendarPage({month,setMonth,events,vacations,onEvent,onVacation,onCreateDate}:{month:Date;setMonth:(date:Date)=>void;events:EventItem[];vacations:Vacation[];onEvent:(event:EventItem)=>void;onVacation:(vacation:Vacation)=>void;onCreateDate:(date:string)=>void}) {
  const [compact, setCompact] = useState(false);
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
  return <div className="page"><section className={`calendarPanel ${compact?"compactCalendar":"largeCalendar"}`}><header className="calendarHeader"><div><small>CALENDAR</small><h1>{monthTitle(month)}</h1></div><div><button className="calendarSizeButton" onClick={toggleCompact} title={compact?"Mărește calendarul":"Micșorează calendarul"}>{compact?<Maximize2/>:<Minimize2/>}<span>{compact?"Mare":"Compact"}</span></button><button className="iconButton" onClick={()=>setMonth(new Date(year,currentMonth-1,1))}><ChevronLeft/></button><button onClick={()=>setMonth(new Date())}>Astăzi</button><button className="iconButton" onClick={()=>setMonth(new Date(year,currentMonth+1,1))}><ChevronRight/></button></div></header><p className="calendarHint">Apasă pe o zi liberă pentru a crea rapid un eveniment. Vacanțele sunt afișate cu mov.</p><div className="calendarViewport"><div className="weekDays">{["L","Ma","Mi","J","V","S","D"].map(day=><span key={day}>{day}</span>)}</div><div className="calendarGrid">{cells.map((day,index)=>{const date=day?`${year}-${String(currentMonth+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`:"";const dayEvents=events.filter(event=>event.event_date===date);const dayVacations=vacations.filter(vacation=>vacation.start_date<=date&&vacation.end_date>=date);return <div key={index} className={`${!day?"day muted":"day"}${date===today?" todayGlow":""}`} onClick={()=>day&&onCreateDate(date)} role={day?"button":undefined} tabIndex={day?0:undefined} onKeyDown={event=>{if(day&&(event.key==="Enter"||event.key===" "))onCreateDate(date)}}><b>{day}</b>{dayEvents.map(event=><button key={event.id} onClick={click=>{click.stopPropagation();onEvent(event)}} title={event.title}><strong>{event.title}</strong><small>{event.event_time?.slice(0,5)}</small></button>)}{dayVacations.map(vacation=><button className="calendarVacation" key={vacation.id} onClick={click=>{click.stopPropagation();onVacation(vacation)}} title={`Vacanță: ${vacation.country}`}><strong><Plane/> {vacation.country}</strong><small>Vacanță</small></button>)}</div>})}</div></div></section></div>;
}
