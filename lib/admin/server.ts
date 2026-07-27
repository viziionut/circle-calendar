import "server-only";

import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

export type AdminContext = {
  user: User;
  role: "owner" | "admin";
  service: SupabaseClient;
};

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function requireAppAdmin(request: Request): Promise<AdminContext | Response> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !publishableKey || !serviceRoleKey) {
    console.error("Admin server environment is incomplete.");
    return jsonError("Configurarea serverului administrativ este incompletă.", 500);
  }

  const authorization = request.headers.get("authorization") || "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return jsonError("Autentificare necesară.", 401);

  const userClient = createClient(url, publishableKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser(token);
  if (userError || !userData.user) return jsonError("Sesiune invalidă sau expirată.", 401);

  const { data: allowed, error: adminCheckError } = await userClient.rpc("is_app_admin");
  if (adminCheckError) {
    console.error("is_app_admin failed", adminCheckError.message);
    return jsonError("Verificarea accesului administrativ a eșuat.", 500);
  }
  if (!allowed) return jsonError("Acces interzis.", 403);

  const service = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: adminRow, error: adminError } = await service.from("app_admins")
    .select("role")
    .eq("user_id", userData.user.id)
    .single();
  if (adminError || !adminRow || !["owner", "admin"].includes(adminRow.role)) {
    return jsonError("Acces interzis.", 403);
  }

  return { user: userData.user, role: adminRow.role as "owner" | "admin", service };
}

export function isErrorResponse(value: AdminContext | Response): value is Response {
  return value instanceof Response;
}

export async function listAllAuthUsers(service: SupabaseClient) {
  const users: User[] = [];
  const perPage = 1000;
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < perPage) break;
  }
  return users;
}

export function countBy<T extends string>(rows: Array<Record<T, string>>, key: T) {
  const counts: Record<string, number> = {};
  rows.forEach(row => { counts[row[key]] = (counts[row[key]] || 0) + 1; });
  return counts;
}
