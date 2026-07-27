"use client";

import {
  Activity, ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, CircleUserRound,
  Plane, RefreshCw, Search, ShieldCheck, Users, UserX, X,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { adminFetch } from "@/lib/admin/client";

type Stats = {
  totalUsers: number; newUsers7d: number; activeUsers24h: number; activeUsers7d: number;
  totalGroups: number; totalEvents: number; totalVacations: number;
};

type AdminUser = {
  id: string; username: string | null; display_name: string | null; avatar_url: string | null;
  email: string | null; created_at: string; last_seen_at: string | null;
  account_status: "active" | "suspended"; suspended_at: string | null; suspended_reason: string | null;
  groupCount: number; eventCount: number; vacationCount: number;
};

type UserDetail = {
  profile: AdminUser;
  groups: Array<{ group_id: string; role: string; joined_at: string; groups: { id: string; name: string; description: string } | null }>;
  activity: { groupCount: number; eventCount: number; vacationCount: number };
};

function formatDate(value: string | null) {
  if (!value) return "Niciodată";
  return new Date(value).toLocaleString("ro-RO", { dateStyle: "medium", timeStyle: "short" });
}

export function AdminPanel({ identity }: { identity: { user: { id: string; email: string | null }; role: "owner" | "admin" } }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadUsers = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), pageSize: "20", search: submittedSearch });
    const data = await adminFetch<{ users: AdminUser[]; total: number; totalPages: number }>(`/api/admin/users?${params}`);
    setUsers(data.users);
    setTotal(data.total);
    setTotalPages(data.totalPages);
  }, [page, submittedSearch]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [statsData] = await Promise.all([adminFetch<Stats>("/api/admin/stats"), loadUsers()]);
      setStats(statsData);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Datele administrative nu au putut fi încărcate.");
    } finally {
      setLoading(false);
    }
  }, [loadUsers]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  async function openUser(userId: string) {
    setError("");
    try {
      setDetail(await adminFetch<UserDetail>(`/api/admin/users/${userId}`));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Utilizatorul nu a putut fi încărcat.");
    }
  }

  async function changeStatus() {
    if (!detail) return;
    const suspended = detail.profile.account_status === "suspended";
    let reason = "";
    if (!suspended) {
      reason = window.prompt("Introdu motivul suspendării (minimum 5 caractere):")?.trim() || "";
      if (!reason) return;
    }
    const action = suspended ? "reactivezi" : "suspendezi";
    if (!window.confirm(`Confirmi că ${action} contul ${detail.profile.email || detail.profile.display_name || ""}?`)) return;
    try {
      await adminFetch(`/api/admin/users/${detail.profile.id}/status`, {
        method: "POST",
        body: JSON.stringify({ status: suspended ? "active" : "suspended", reason }),
      });
      await Promise.all([openUser(detail.profile.id), loadAll()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Statusul nu a putut fi schimbat.");
    }
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setSubmittedSearch(search.trim());
  }

  const cards = stats ? [
    ["Total utilizatori", stats.totalUsers, Users],
    ["Noi în 7 zile", stats.newUsers7d, CircleUserRound],
    ["Activi în 24h", stats.activeUsers24h, Activity],
    ["Activi în 7 zile", stats.activeUsers7d, Activity],
    ["Total grupuri", stats.totalGroups, Users],
    ["Total evenimente", stats.totalEvents, CalendarDays],
    ["Total concedii", stats.totalVacations, Plane],
  ] as const : [];

  return <main className="adminPanel">
    <header className="adminTopbar"><a href="/"><ArrowLeft/> Aplicație</a><div><ShieldCheck/><strong>Administrare</strong><span>{identity.role}</span></div><small>{identity.user.email}</small></header>
    <div className="adminContent">
      <section className="adminHero"><small>CIRCLE CALENDAR CONTROL</small><h1>Dashboard administrativ</h1><p>Date operaționale necesare pentru administrarea sigură a aplicației.</p></section>
      {error && <div className="adminError">{error}</div>}
      {loading && !stats ? <div className="adminLoading"><RefreshCw className="spin"/> Se încarcă…</div> : <>
        <section className="adminStatGrid">{cards.map(([label, value, Icon]) => <article key={label}><Icon/><span>{label}</span><strong>{value}</strong></article>)}</section>
        <section className="adminUsersSection">
          <header><div><small>UTILIZATORI</small><h2>Conturi</h2><p>{total} rezultate</p></div><form onSubmit={submitSearch}><Search/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Nume, username sau email"/><button>Caută</button></form></header>
          <div className="adminUserTable">
            <div className="adminUserTableHead"><span>Utilizator</span><span>Înregistrare</span><span>Ultima activitate</span><span>Activitate</span><span>Status</span></div>
            {users.map(user => <button className="adminUserRow" key={user.id} onClick={() => void openUser(user.id)}>
              <span className="adminUserIdentity">{user.avatar_url ? <img src={user.avatar_url} alt=""/> : <i>{(user.display_name || user.username || "U").slice(0,2).toUpperCase()}</i>}<span><strong>{user.display_name || "Fără nume"}</strong><small>@{user.username || "—"} · {user.email || "Fără email"}</small></span></span>
              <span>{formatDate(user.created_at)}</span><span>{formatDate(user.last_seen_at)}</span>
              <span>{user.groupCount}G · {user.eventCount}E · {user.vacationCount}C</span>
              <span><i className={`adminStatus ${user.account_status}`}>{user.account_status}</i></span>
            </button>)}
            {!users.length && <div className="adminNoUsers">Nu există utilizatori pentru această căutare.</div>}
          </div>
          <footer className="adminPagination"><button disabled={page === 1} onClick={() => setPage(value => value - 1)}><ChevronLeft/>Anterior</button><span>Pagina {page} din {totalPages}</span><button disabled={page >= totalPages} onClick={() => setPage(value => value + 1)}>Următor<ChevronRight/></button></footer>
        </section>
      </>}
    </div>
    {detail && <aside className="adminDetailBack" onMouseDown={() => setDetail(null)}><section className="adminDetail" onMouseDown={event => event.stopPropagation()}>
      <header><div><small>DETALII UTILIZATOR</small><h2>{detail.profile.display_name || detail.profile.username || "Utilizator"}</h2></div><button onClick={() => setDetail(null)}><X/></button></header>
      <div className="adminDetailProfile">{detail.profile.avatar_url ? <img src={detail.profile.avatar_url} alt=""/> : <span>{(detail.profile.display_name || "U").slice(0,2).toUpperCase()}</span>}<div><strong>{detail.profile.email}</strong><small>@{detail.profile.username || "—"}</small><i className={`adminStatus ${detail.profile.account_status}`}>{detail.profile.account_status}</i></div></div>
      <dl><div><dt>Înregistrare</dt><dd>{formatDate(detail.profile.created_at)}</dd></div><div><dt>Ultima activitate</dt><dd>{formatDate(detail.profile.last_seen_at)}</dd></div><div><dt>Activitate</dt><dd>{detail.activity.groupCount} grupuri · {detail.activity.eventCount} evenimente · {detail.activity.vacationCount} concedii</dd></div>{detail.profile.suspended_reason && <div><dt>Motiv suspendare</dt><dd>{detail.profile.suspended_reason}</dd></div>}</dl>
      <section className="adminDetailGroups"><h3>Grupuri și roluri</h3>{detail.groups.length ? detail.groups.map(item => <article key={item.group_id}><div><strong>{item.groups?.name || "Grup"}</strong><small>{item.groups?.description || "Fără descriere"}</small></div><span>{item.role}</span></article>) : <p>Nu face parte din niciun grup.</p>}</section>
      {detail.profile.id !== identity.user.id && <button className={detail.profile.account_status === "suspended" ? "adminReactivate" : "adminSuspend"} onClick={() => void changeStatus()}>{detail.profile.account_status === "suspended" ? <><ShieldCheck/>Reactivează utilizatorul</> : <><UserX/>Suspendă utilizatorul</>}</button>}
    </section></aside>}
  </main>;
}
