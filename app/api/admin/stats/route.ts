import { isErrorResponse, requireAppAdmin } from "@/lib/admin/server";

export async function GET(request: Request) {
  const context = await requireAppAdmin(request);
  if (isErrorResponse(context)) return context;
  const now = Date.now();
  const sevenDaysAgo = new Date(now - 7 * 86400000).toISOString();
  const oneDayAgo = new Date(now - 86400000).toISOString();
  const count = { count: "exact" as const, head: true };

  const [totalUsers, newUsers, activeDay, activeWeek, groups, events, vacations] = await Promise.all([
    context.service.from("profiles").select("id", count),
    context.service.from("profiles").select("id", count).gte("created_at", sevenDaysAgo),
    context.service.from("profiles").select("id", count).gte("last_seen_at", oneDayAgo),
    context.service.from("profiles").select("id", count).gte("last_seen_at", sevenDaysAgo),
    context.service.from("groups").select("id", count),
    context.service.from("events").select("id", count),
    context.service.from("vacations").select("id", count),
  ]);
  const error = [totalUsers, newUsers, activeDay, activeWeek, groups, events, vacations].find(result => result.error)?.error;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({
    totalUsers: totalUsers.count || 0,
    newUsers7d: newUsers.count || 0,
    activeUsers24h: activeDay.count || 0,
    activeUsers7d: activeWeek.count || 0,
    totalGroups: groups.count || 0,
    totalEvents: events.count || 0,
    totalVacations: vacations.count || 0,
  });
}
