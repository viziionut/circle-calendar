import { countBy, isErrorResponse, listAllAuthUsers, requireAppAdmin } from "@/lib/admin/server";

export async function GET(request: Request) {
  const context = await requireAppAdmin(request);
  if (isErrorResponse(context)) return context;
  const params = new URL(request.url).searchParams;
  const search = (params.get("search") || "").trim().toLocaleLowerCase("ro").slice(0, 100);
  const page = Math.max(1, Math.min(100000, Number(params.get("page")) || 1));
  const pageSize = Math.max(10, Math.min(100, Number(params.get("pageSize")) || 20));

  try {
    const [profilesResult, membershipsResult, eventsResult, vacationsResult, authUsers] = await Promise.all([
      context.service.from("profiles").select("id,username,display_name,avatar_url,created_at,last_seen_at,account_status,suspended_at,suspended_reason"),
      context.service.from("group_members").select("user_id"),
      context.service.from("events").select("created_by"),
      context.service.from("vacations").select("user_id"),
      listAllAuthUsers(context.service),
    ]);
    const error = profilesResult.error || membershipsResult.error || eventsResult.error || vacationsResult.error;
    if (error) return Response.json({ error: error.message }, { status: 500 });

    const emailById = new Map(authUsers.map(user => [user.id, user.email || null]));
    const groupCounts = countBy((membershipsResult.data || []) as Array<{ user_id: string }>, "user_id");
    const eventCounts = countBy((eventsResult.data || []) as Array<{ created_by: string }>, "created_by");
    const vacationCounts = countBy((vacationsResult.data || []) as Array<{ user_id: string }>, "user_id");
    const users = (profilesResult.data || []).map(profile => ({
      ...profile,
      email: emailById.get(profile.id) || null,
      groupCount: groupCounts[profile.id] || 0,
      eventCount: eventCounts[profile.id] || 0,
      vacationCount: vacationCounts[profile.id] || 0,
    })).filter(user => !search || [
      user.display_name,
      user.username,
      user.email,
    ].some(value => value?.toLocaleLowerCase("ro").includes(search)));

    users.sort((left, right) => (right.created_at || "").localeCompare(left.created_at || ""));
    const start = (page - 1) * pageSize;
    return Response.json({
      users: users.slice(start, start + pageSize),
      page,
      pageSize,
      total: users.length,
      totalPages: Math.max(1, Math.ceil(users.length / pageSize)),
    });
  } catch (error) {
    console.error("Admin user list failed", error);
    return Response.json({ error: "Lista utilizatorilor nu a putut fi încărcată." }, { status: 500 });
  }
}
