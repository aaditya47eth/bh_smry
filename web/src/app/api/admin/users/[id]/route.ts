import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServerClient";
import { hashPassword } from "@/lib/password";
import { requireAuth } from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdminClient";

type PatchBody = {
  username?: string;
  number?: string | null;
  password?: string; // empty string allowed
  access_level?: string;
};

function emailLocalPartFromUser(username: string, number: string): string {
  const base = (number || username || "user")
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "")
    .slice(0, 48);
  return base || `user_${Date.now()}`;
}

export async function PATCH(
  request: Request,
  context: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(request, ["admin", "manager"]);
    if (!auth.ok) return auth.response;

    const id = context.params.id;
    const body = (await request.json()) as PatchBody;
    const supabase = getSupabaseServerClient();
    const { data: existingUser, error: existingErr } = await supabase
      .from("users")
      .select("id, username, number, auth_user_id, auth_email")
      .eq("id", id)
      .maybeSingle();
    if (existingErr) throw existingErr;
    if (!existingUser) {
      return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
    }

    const updates: Record<string, unknown> = {};
    if (typeof body.username === "string") updates.username = body.username.trim();
    if ("number" in body) updates.number = body.number ? String(body.number).trim() : null;
    if (typeof body.access_level === "string")
      updates.access_level = body.access_level.trim();
    if (typeof body.password === "string") {
      updates.password = body.password ? hashPassword(body.password) : "";

      if (body.password) {
        const adminClient = getSupabaseAdminClient();
        if (adminClient) {
          const existingAuthUserId = String((existingUser as any).auth_user_id ?? "").trim();
          if (existingAuthUserId) {
            const { error: updAuthErr } = await adminClient.auth.admin.updateUserById(
              existingAuthUserId,
              { password: body.password }
            );
            if (updAuthErr) {
              return NextResponse.json(
                { ok: false, error: `Supabase auth update failed: ${updAuthErr.message}` },
                { status: 400 }
              );
            }
          } else {
            const nextUsername = String(
              (updates.username as string | undefined) ?? (existingUser as any).username ?? ""
            );
            const nextNumber = String(
              (updates.number as string | undefined) ?? (existingUser as any).number ?? ""
            );
            const emailBase = emailLocalPartFromUser(nextUsername, nextNumber);
            const authEmail = `${emailBase}+${Date.now()}@bh.local`;
            const { data: authData, error: createAuthErr } = await adminClient.auth.admin.createUser(
              {
                email: authEmail,
                password: body.password,
                email_confirm: true
              }
            );
            if (createAuthErr) {
              return NextResponse.json(
                { ok: false, error: `Supabase auth create failed: ${createAuthErr.message}` },
                { status: 400 }
              );
            }
            updates.auth_user_id = authData.user?.id ?? null;
            updates.auth_email = authEmail;
          }
        }
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { ok: false, error: "No updates provided" },
        { status: 400 }
      );
    }

    // Duplicate username guard (only when changing it)
    if (typeof updates.username === "string" && updates.username.length > 0) {
      const { data: existing, error: existingErr } = await supabase
        .from("users")
        .select("id")
        .eq("username", updates.username as string)
        .neq("id", id)
        .limit(1);
      if (existingErr) throw existingErr;
      if (existing && existing.length > 0) {
        return NextResponse.json(
          { ok: false, error: "Username already exists" },
          { status: 409 }
        );
      }
    }

    const { error } = await supabase.from("users").update(updates).eq("id", id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(_request, ["admin", "manager"]);
    if (!auth.ok) return auth.response;

    const id = context.params.id;
    const supabase = getSupabaseServerClient();
    const { error } = await supabase.from("users").delete().eq("id", id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}

