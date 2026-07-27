import { isErrorResponse, requireAppAdmin } from "@/lib/admin/server";

export async function GET(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const context = await requireAppAdmin(request);
  if (isErrorResponse(context)) return context;
  const { userId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return Response.json({ error: "User ID invalid." }, { status: 400 });

  const [profile, memberships, events, vacations, authUser] = await Promise.all([
    context.service.from("profiles").select("id,username,display_name,avatar_url,created_at,last_seen_at,account_status,suspended_at,suspended_reason").eq("id", userId).single(),
    context.service.from("group_members").select("group_id,role,joined_at,groups(id,name,description)").eq("user_id", userId),
    context.service.from("events").select("id", { count: "exact", head: true }).eq("created_by", userId),
    context.service.from("vacations").select("id", { count: "exact", head: true }).eq("user_id", userId),
    context.service.auth.admin.getUserById(userId),
  ]);
  const error = profile.error || memberships.error || events.error || vacations.error || authUser.error;
  if (error) return Response.json({ error: error.message }, { status: error === profile.error ? 404 : 500 });

  return Response.json({
    profile: { ...profile.data, email: authUser.data.user.email || null },
    groups: memberships.data || [],
    activity: {
      groupCount: memberships.data?.length || 0,
      eventCount: events.count || 0,
      vacationCount: vacations.count || 0,
    },
  });
}
