import { isErrorResponse, requireAppAdmin } from "@/lib/admin/server";

export async function POST(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const context = await requireAppAdmin(request);
  if (isErrorResponse(context)) return context;
  const { userId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return Response.json({ error: "User ID invalid." }, { status: 400 });
  if (userId === context.user.id) return Response.json({ error: "Nu îți poți suspenda propriul cont." }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Date JSON invalide." }, { status: 400 });
  }
  const values = body as { status?: unknown; reason?: unknown };
  if (values.status !== "active" && values.status !== "suspended") {
    return Response.json({ error: "Status invalid." }, { status: 400 });
  }
  const reason = typeof values.reason === "string" ? values.reason.trim() : "";
  if (values.status === "suspended" && (reason.length < 5 || reason.length > 500)) {
    return Response.json({ error: "Motivul trebuie să aibă între 5 și 500 de caractere." }, { status: 400 });
  }

  const nextProfile = values.status === "suspended"
    ? { account_status: "suspended", suspended_at: new Date().toISOString(), suspended_reason: reason }
    : { account_status: "active", suspended_at: null, suspended_reason: null };
  const { data: previous, error: previousError } = await context.service.from("profiles")
    .select("account_status,suspended_at,suspended_reason")
    .eq("id", userId)
    .single();
  if (previousError) return Response.json({ error: "Utilizatorul nu există." }, { status: 404 });

  const { error: updateError } = await context.service.from("profiles").update(nextProfile).eq("id", userId);
  if (updateError) return Response.json({ error: updateError.message }, { status: 500 });

  const { error: authError } = await context.service.auth.admin.updateUserById(userId, {
    ban_duration: values.status === "suspended" ? "876000h" : "none",
  });
  if (authError) {
    await context.service.from("profiles").update(previous).eq("id", userId);
    return Response.json({ error: "Statusul de autentificare nu a putut fi actualizat." }, { status: 500 });
  }

  const action = values.status === "suspended" ? "user.suspended" : "user.reactivated";
  const { error: auditError } = await context.service.from("admin_audit_logs").insert({
    admin_user_id: context.user.id,
    action,
    target_user_id: userId,
    details: values.status === "suspended" ? { reason } : {},
  });
  if (auditError) console.error("Audit log insert failed", auditError.message);

  return Response.json({ success: true, status: values.status });
}
