"use client";

import {
  Bell, CalendarDays, Check, CheckCheck, ChevronRight, CircleHelp, Loader2,
  MessageCircle, Plane, Sparkles, Trash2, UserPlus, Users, X,
} from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  deleteAllReadNotifications, deleteNotification, fetchNotifications, fetchUnreadCount,
  markAllNotificationsRead, markNotificationRead, NOTIFICATION_PAGE_SIZE,
} from "@/lib/notifications";
import type { AppNotification, NotificationType, Profile } from "@/types/database";
import { useI18n } from "@/lib/i18n";

const TYPE_ICONS: Partial<Record<NotificationType, typeof Bell>> = {
  group_invitation: UserPlus, group_member_joined: Users,
  event_created: CalendarDays, event_updated: CalendarDays, event_cancelled: CalendarDays,
  quick_plan_created: Sparkles, quick_plan_vote_requested: Sparkles,
  quick_plan_voted: Check, quick_plan_last_vote: CircleHelp,
  quick_plan_confirmed: CheckCheck, quick_plan_event_created: CalendarDays,
  quick_plan_comment: MessageCircle, quick_plan_response_due: Sparkles,
  vacation_created: Plane, event_tomorrow: CalendarDays,
};

function actorName(profile?: Profile | null) {
  return profile?.display_name || profile?.username || "Circle Calendar";
}

function initials(profile?: Profile | null) {
  return actorName(profile).split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase();
}

function dateGroup(value: string) {
  const date = new Date(value);
  const today = new Date();
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const difference = Math.round((todayDay - day) / 86400000);
  return difference === 0 ? "today" : difference === 1 ? "yesterday" : "older";
}

function notificationVariables(notification: AppNotification) {
  const metadata = notification.metadata || {};
  return {
    actor: actorName(notification.actor),
    title: String(metadata.title || metadata.event_title || metadata.plan_title || metadata.group_name || ""),
    country: String(metadata.country || ""),
  };
}

export const NotificationCenter = memo(function NotificationCenter({
  userId, onNavigate,
}: {
  userId: string;
  onNavigate: (notification: AppNotification) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<AppNotification | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ kind: "one" | "read"; id?: string } | null>(null);
  const knownIds = useRef(new Set<string>());
  const toastTimer = useRef<number | null>(null);

  const loadPage = useCallback(async (targetPage: number, replace = false) => {
    setLoading(true);
    try {
      const rows = await fetchNotifications(userId, targetPage);
      setItems(current => {
        const next = replace ? rows : [...current, ...rows.filter(row => !knownIds.current.has(row.id))];
        knownIds.current = new Set(next.map(row => row.id));
        return next;
      });
      setHasMore(rows.length === NOTIFICATION_PAGE_SIZE);
      setPage(targetPage);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error && caught.message.includes("notifications")
        ? t("notifications.migration")
        : t("notifications.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t, userId]);

  const refreshCount = useCallback(async () => {
    try { setUnread(await fetchUnreadCount(userId)); } catch { /* migration may not be installed yet */ }
  }, [userId]);

  useEffect(() => {
    void Promise.all([loadPage(0, true), refreshCount()]);
    const channel = supabase.channel(`notifications-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, payload => {
        void refreshCount();
        if (payload.eventType === "INSERT") {
          const incoming = payload.new as AppNotification;
          if (knownIds.current.has(incoming.id)) return;
          knownIds.current.add(incoming.id);
          setItems(current => [incoming, ...current]);
          if (incoming.actor_id) {
            void supabase.from("profiles").select("*").eq("id", incoming.actor_id).maybeSingle().then(({ data }) => {
              if (!data) return;
              const enriched = { ...incoming, actor: data as Profile };
              setItems(current => current.map(item => item.id === incoming.id ? enriched : item));
              setToast(current => current?.id === incoming.id ? enriched : current);
            });
          }
          if (incoming.actor_id !== userId) {
            setToast(incoming);
            if (toastTimer.current) window.clearTimeout(toastTimer.current);
            toastTimer.current = window.setTimeout(() => setToast(null), 5200);
          }
        } else if (payload.eventType === "UPDATE") {
          const changed = payload.new as AppNotification;
          setItems(current => current.map(item => item.id === changed.id ? { ...item, ...changed } : item));
        } else if (payload.eventType === "DELETE") {
          const removedId = (payload.old as { id?: string }).id;
          setItems(current => current.filter(item => item.id !== removedId));
          if (removedId) knownIds.current.delete(removedId);
        }
      }).subscribe();
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
      void supabase.removeChannel(channel);
    };
  }, [loadPage, refreshCount, userId]);

  const groups = useMemo(() => {
    const result = new Map<string, AppNotification[]>();
    items.forEach(item => {
      const label = dateGroup(item.created_at);
      result.set(label, [...(result.get(label) || []), item]);
    });
    return ["today", "yesterday", "older"].map(label => [label, result.get(label) || []] as const).filter(([, values]) => values.length);
  }, [items]);

  async function openNotification(notification: AppNotification) {
    if (!notification.is_read) {
      await markNotificationRead(notification.id);
      setItems(current => current.map(item => item.id === notification.id ? { ...item, is_read: true, read_at: new Date().toISOString() } : item));
      setUnread(value => Math.max(0, value - 1));
    }
    setOpen(false);
    setToast(null);
    onNavigate(notification);
  }

  async function markOne(event: React.MouseEvent, notification: AppNotification) {
    event.stopPropagation();
    if (notification.is_read) return;
    await markNotificationRead(notification.id);
    setItems(current => current.map(item => item.id === notification.id ? { ...item, is_read: true } : item));
    setUnread(value => Math.max(0, value - 1));
  }

  async function markAll() {
    await markAllNotificationsRead(userId);
    setItems(current => current.map(item => ({ ...item, is_read: true })));
    setUnread(0);
  }

  async function confirmDelete() {
    if (!confirmAction) return;
    if (confirmAction.kind === "one" && confirmAction.id) {
      await deleteNotification(confirmAction.id);
      setItems(current => current.filter(item => item.id !== confirmAction.id));
    } else {
      await deleteAllReadNotifications(userId);
      setItems(current => current.filter(item => !item.is_read));
    }
    setConfirmAction(null);
    await refreshCount();
  }

  return <>
    <button className="iconButton notificationBell" aria-label={t("notifications.title")} aria-expanded={open} onClick={() => setOpen(true)}><Bell/>{unread > 0 && <span>{unread > 99 ? "99+" : unread}</span>}</button>
    {open && <div className="notificationBackdrop" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <aside className="notificationCenter" aria-label={t("notifications.aria")}>
        <span className="sheetHandle"/>
        <header><div><small>{t("notifications.updates")}</small><h2>{t("notifications.title")}</h2></div><button className="iconButton" onClick={() => setOpen(false)}><X/></button></header>
        <div className="notificationActions"><button disabled={!unread} onClick={() => void markAll()}><CheckCheck/> {t("notifications.markAll")}</button><button disabled={!items.some(item => item.is_read)} onClick={() => setConfirmAction({ kind: "read" })}><Trash2/> {t("notifications.deleteRead")}</button></div>
        <div className="notificationScroll">
          {loading && !items.length ? <NotificationSkeleton/> : error ? <div className="notificationEmpty"><CircleHelp/><h3>{t("notifications.unavailable")}</h3><p>{error}</p></div> : !items.length ? <div className="notificationEmpty"><img src="/brand/empty/notifications.svg" alt=""/><h3>{t("notifications.emptyTitle")}</h3><p>{t("notifications.emptyText")}</p></div> : groups.map(([label, values]) => <section className="notificationGroup" key={label}><h3>{t(`common.${label}`)}</h3>{values.map(notification => <NotificationRow key={notification.id} notification={notification} onOpen={() => void openNotification(notification)} onRead={event => void markOne(event, notification)} onDelete={event => { event.stopPropagation(); setConfirmAction({ kind: "one", id: notification.id }); }}/>)}</section>)}
          {hasMore && <button className="loadMoreNotifications" disabled={loading} onClick={() => void loadPage(page + 1)}>{loading ? <Loader2 className="spin"/> : null} {t("notifications.loadMore")}</button>}
        </div>
      </aside>
    </div>}
    {toast && <button className="notificationToast" onClick={() => void openNotification(toast)}><NotificationIcon type={toast.type}/><div><strong>{t(`notifications.types.${toast.type}.title`, notificationVariables(toast))}</strong><span>{t(`notifications.types.${toast.type}.message`, notificationVariables(toast))}</span></div><ChevronRight/></button>}
    {confirmAction && <div className="notificationConfirmBack"><section><Trash2/><h3>{confirmAction.kind === "one" ? t("notifications.deleteOneTitle") : t("notifications.deleteReadTitle")}</h3><p>{t("notifications.irreversible")}</p><div><button className="secondary" onClick={() => setConfirmAction(null)}>{t("common.cancel")}</button><button className="dangerButton" onClick={() => void confirmDelete()}>{t("common.delete")}</button></div></section></div>}
  </>;
});

function NotificationRow({ notification, onOpen, onRead, onDelete }: { notification: AppNotification; onOpen: () => void; onRead: (event: React.MouseEvent) => void; onDelete: (event: React.MouseEvent) => void }) {
  const { formatRelative, t } = useI18n();
  return <article className={`notificationRow ${notification.is_read ? "" : "unread"}`} onClick={onOpen} role="button" tabIndex={0} onKeyDown={event => { if (event.key === "Enter") onOpen(); }}>
    <span className="notificationAvatar">{notification.actor?.avatar_url ? <img src={notification.actor.avatar_url} alt=""/> : initials(notification.actor)}</span>
    <span className="notificationTypeIcon"><NotificationIcon type={notification.type}/></span>
    <div><strong>{t(`notifications.types.${notification.type}.title`, notificationVariables(notification))}</strong><p>{t(`notifications.types.${notification.type}.message`, notificationVariables(notification))}</p><time>{formatRelative(notification.created_at)}</time></div>
    {!notification.is_read && <i aria-label={t("notifications.unread")}/>}
    <span className="notificationRowActions"><button title={t("notifications.markRead")} disabled={notification.is_read} onClick={onRead}><Check/></button><button title={t("common.delete")} onClick={onDelete}><Trash2/></button></span>
  </article>;
}

function NotificationIcon({ type }: { type: NotificationType }) {
  const Icon = TYPE_ICONS[type] || Bell;
  return <Icon/>;
}

function NotificationSkeleton() {
  return <div className="notificationSkeleton">{[1,2,3,4].map(item => <span key={item}><i/><b/><em/></span>)}</div>;
}
