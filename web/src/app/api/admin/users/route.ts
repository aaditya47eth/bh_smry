import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServerClient";
import { hashPassword } from "@/lib/password";
import { requireAuth } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdminClient";

type UserRow = {
  id: number | string;
  username: string | null;
  number: string | null;
  password: string | null;
  access_level: string | null;
  auth_user_id?: string | null;
  auth_email?: string | null;
  created_at?: string | null;
};

function emailLocalPartFromUser(username: string, number: string): string {
  const base = (number || username || "user")
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "")
    .slice(0, 48);
  return base || `user_${Date.now()}`;
}

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request, ["admin", "manager"]);
    if (!auth.ok) return auth.response;

    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("users")
      .select("id, username, number, password, access_level, created_at");

    if (error) throw error;

    // Match legacy ordering: admin > manager > viewer, then username asc
    const accessOrder: Record<string, number> = { admin: 0, manager: 1, viewer: 2 };
    const users = ((data ?? []) as UserRow[]).sort((a, b) => {
      const levelDiff =
        (accessOrder[(a.access_level ?? "").toLowerCase()] ?? 999) -
        (accessOrder[(b.access_level ?? "").toLowerCase()] ?? 999);
      if (levelDiff !== 0) return levelDiff;
      return (a.username ?? "").localeCompare(b.username ?? "");
    }).map((u) => ({
      ...u,
      // Do not expose raw password/hash to the client.
      password: u.password ? "__set__" : null
    }));

    return NextResponse.json({ ok: true, users });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth(request, ["admin", "manager"]);
    if (!auth.ok) return auth.response;

    const body = (await request.json()) as Partial<UserRow>;
    const username = (body.username ?? "").trim();
    const number = (body.number ?? "").trim();
    const access_level = (body.access_level ?? "").trim();
    const password = body.password ?? "";

    if (!username || !access_level) {
      return NextResponse.json(
        { ok: false, error: "username and access_level are required" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServerClient();

    // Duplicate username guard (legacy behavior)
    const { data: existing, error: existingErr } = await supabase
      .from("users")
      .select("id")
      .eq("username", username)
      .limit(1);
    if (existingErr) throw existingErr;
    if (existing && existing.length > 0) {
      return NextResponse.json(
        { ok: false, error: "Username already exists" },
        { status: 409 }
      );
    }

    const adminClient = getSupabaseAdminClient();
    let authUserId: string | null = null;
    let authEmail: string | null = null;
    if (adminClient && password) {
      const emailBase = emailLocalPartFromUser(username, number);
      authEmail = `${emailBase}+${Date.now()}@bh.local`;
      const { data: authData, error: authErr } = await adminClient.auth.admin.createUser({
        email: authEmail,
        password,
        email_confirm: true
      });
      if (authErr) {
        return NextResponse.json(
          { ok: false, error: `Supabase auth create failed: ${authErr.message}` },
          { status: 400 }
        );
      }
      authUserId = authData.user?.id ?? null;
    }

    const { error } = await supabase.from("users").insert([
      {
        username,
        number: number || null,
        access_level,
        password: password ? hashPassword(password) : "",
        auth_user_id: authUserId,
        auth_email: authEmail
      }
    ]);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}

