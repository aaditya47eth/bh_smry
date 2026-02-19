import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServerClient";
import type { SessionUser } from "@/lib/types";

type AuthSessionRow = {
  token_hash: string;
  user_id: string;
  expires_at: string;
  revoked: boolean | null;
};

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function parseTokenFromRequest(request: Request): string {
  const cookie = request.headers.get("cookie") ?? "";
  const cookieMatch = cookie.match(/(?:^|;\s*)bh_access_token=([^;]+)/);
  if (cookieMatch?.[1]) return decodeURIComponent(cookieMatch[1]);
  const auth = request.headers.get("authorization") ?? "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() ?? "";
}

export async function issueAuthSession(params: {
  userId: string;
  rememberMe: boolean;
}): Promise<{ token: string; expiresAtIso: string }> {
  const supabase = getSupabaseServerClient();
  const token = `${crypto.randomUUID()}-${Date.now()}`;
  const expiresAt = new Date(
    Date.now() + (params.rememberMe ? 30 : 1) * 24 * 60 * 60 * 1000
  ).toISOString();

  const { error } = await supabase.from("auth_sessions").insert([
    {
      token_hash: tokenHash(token),
      user_id: params.userId,
      expires_at: expiresAt,
      revoked: false
    }
  ]);
  if (error) throw error;
  return { token, expiresAtIso: expiresAt };
}

export async function revokeAuthSessionByToken(token: string): Promise<void> {
  if (!token) return;
  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from("auth_sessions")
    .update({ revoked: true })
    .eq("token_hash", tokenHash(token));
  if (error) throw error;
}

export async function requireAuth(
  request: Request,
  allowedLevels?: string[]
): Promise<
  | { ok: true; user: SessionUser; level: string; token: string }
  | { ok: false; response: NextResponse }
> {
  const token = parseTokenFromRequest(request);
  if (!token) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    };
  }

  const supabase = getSupabaseServerClient();
  const { data: session, error: sesErr } = await supabase
    .from("auth_sessions")
    .select("token_hash, user_id, expires_at, revoked")
    .eq("token_hash", tokenHash(token))
    .maybeSingle();
  if (sesErr || !session) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    };
  }

  const s = session as AuthSessionRow;
  if (s.revoked) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "Session revoked" }, { status: 401 })
    };
  }
  if (new Date(s.expires_at).getTime() <= Date.now()) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "Session expired" }, { status: 401 })
    };
  }

  const { data: user, error: userErr } = await supabase
    .from("users")
    .select("id, number, username, access_level")
    .eq("id", s.user_id)
    .maybeSingle();
  if (userErr || !user) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    };
  }

  const level = String((user as any).access_level ?? "").toLowerCase();
  if (allowedLevels && !allowedLevels.includes(level)) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 })
    };
  }

  return {
    ok: true,
    token,
    level,
    user: {
      id: String((user as any).id),
      name: String((user as any).number ?? (user as any).username ?? ""),
      username: String((user as any).username ?? (user as any).number ?? ""),
      access_level: String((user as any).access_level ?? "viewer")
    }
  };
}

