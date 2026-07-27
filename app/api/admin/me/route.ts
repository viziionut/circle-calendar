import { isErrorResponse, requireAppAdmin } from "@/lib/admin/server";

export async function GET(request: Request) {
  const context = await requireAppAdmin(request);
  if (isErrorResponse(context)) return context;
  return Response.json({
    user: { id: context.user.id, email: context.user.email || null },
    role: context.role,
  });
}
