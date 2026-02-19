import { NextResponse } from "next/server";
import { hashPassword, isPasswordHashed } from "@/lib/password";
import { requireAuth } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdminClient";
import { getSupabaseServerClient } from "@/lib/supabaseServerClient";

type UserRow = {
  id: number | string;
  username: string | null;
  number: string | null;
  password: string | null;
  auth_user_id: string | null;
  auth_email: string | null;
};

function emailLocalPartFromUser(username: string, number: string, id: string): string {
  const base = (number || username || `user_${id}`)
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "")
    .slice(0, 48);
  return base || `user_${id}`;
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth(request, ["admin"]);
    if (!auth.ok) return auth.response;

    const adminClient = getSupabaseAdminClient();
    if (!adminClient) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "SUPABASE_SERVICE_ROLE_KEY is missing. Add it to env before running auth migration."
        },
        { status: 501 }
      );
    }

    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("users")
      .select("id, username, number, password, auth_user_id, auth_email");
    if (error) throw error;

    const users = (data ?? []) as UserRow[];
    const result = {
      scanned: users.length,
      migrated: 0,
      skipped_already_mapped: 0,
      skipped_no_password: 0,
      skipped_hashed_password: 0,
      failed: 0,
      failed_users: [] as Array<{ id: string; reason: string }>
    };

    for (const u of users) {
      const id = String(u.id);
      if (u.auth_user_id || (u.auth_email ?? "").trim()) {
        result.skipped_already_mapped += 1;
        continue;
      }
      const rawPassword = String(u.password ?? "");
      if (!rawPassword) {
        result.skipped_no_password += 1;
        continue;
      }
      if (isPasswordHashed(rawPassword)) {
        // Cannot recover plaintext from hash; keep current fallback login for this user.
        result.skipped_hashed_password += 1;
        continue;
      }

      const emailBase = emailLocalPartFromUser(
        String(u.username ?? ""),
        String(u.number ?? ""),
        id
      );
      const authEmail = `${emailBase}+${id}@bh.local`;
      const { data: authUser, error: createErr } = await adminClient.auth.admin.createUser({
        email: authEmail,
        password: rawPassword,
        email_confirm: true
      });

      if (createErr || !authUser.user?.id) {
        result.failed += 1;
        result.failed_users.push({ id, reason: createErr?.message ?? "Unknown createUser error" });
        continue;
      }

      const { error: updErr } = await supabase
        .from("users")
        .update({
          auth_user_id: authUser.user.id,
          auth_email: authEmail,
          password: hashPassword(rawPassword)
        })
        .eq("id", id);
      if (updErr) {
        result.failed += 1;
        result.failed_users.push({ id, reason: updErr.message });
        continue;
      }

      result.migrated += 1;
    }

    return NextResponse.json({ ok: true, result });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}

