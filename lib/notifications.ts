import { supabase } from "@/lib/supabase";
import type { AppNotification, NotificationPreferences, Profile } from "@/types/database";

export const NOTIFICATION_PAGE_SIZE = 20;

export async function fetchNotifications(userId: string, page: number) {
  const from = page * NOTIFICATION_PAGE_SIZE;
  const { data, error } = await supabase.from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(from, from + NOTIFICATION_PAGE_SIZE - 1);
  if (error) throw error;
  const rows = (data || []) as AppNotification[];
  const actorIds = [...new Set(rows.map(item => item.actor_id).filter(Boolean))] as string[];
  const { data: profiles, error: profileError } = actorIds.length
    ? await supabase.from("profiles").select("*").in("id", actorIds)
    : { data: [], error: null };
  if (profileError) throw profileError;
  const actors = new Map(((profiles || []) as Profile[]).map(profile => [profile.id, profile]));
  return rows.map(item => ({ ...item, actor: item.actor_id ? actors.get(item.actor_id) || null : null }));
}

export async function fetchUnreadCount(userId: string) {
  const { count, error } = await supabase.from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_read", false);
  if (error) throw error;
  return count || 0;
}

export async function markNotificationRead(id: string) {
  const { error } = await supabase.from("notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function markAllNotificationsRead(userId: string) {
  const { error } = await supabase.from("notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("is_read", false);
  if (error) throw error;
}

export async function deleteNotification(id: string) {
  const { error } = await supabase.from("notifications").delete().eq("id", id);
  if (error) throw error;
}

export async function deleteAllReadNotifications(userId: string) {
  const { error } = await supabase.from("notifications")
    .delete()
    .eq("user_id", userId)
    .eq("is_read", true);
  if (error) throw error;
}

export async function fetchNotificationPreferences(userId: string) {
  const { data, error } = await supabase.from("notification_preferences")
    .select("*").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  if (data) return data as NotificationPreferences;
  const defaults = {
    user_id: userId, groups_enabled: true, events_enabled: true,
    quick_plans_enabled: true, vacations_enabled: true, reminders_enabled: true,
  };
  const { data: inserted, error: insertError } = await supabase.from("notification_preferences")
    .insert(defaults).select().single();
  if (insertError) throw insertError;
  return inserted as NotificationPreferences;
}

export async function saveNotificationPreferences(userId: string, values: Partial<NotificationPreferences>) {
  const { error } = await supabase.from("notification_preferences")
    .upsert({ user_id: userId, ...values, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) throw error;
}
