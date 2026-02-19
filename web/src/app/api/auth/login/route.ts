import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServerClient";
import { hashPassword, isPasswordHashed, verifyPassword } from "@/lib/password";
import { issueAuthSession } from "@/lib/serverAuth";

type LockState = {
  number: string;
  fail_count: number;
  post_first_ban: boolean;
  locked_until: string | null;
};

const memoryLockState = new Map<string, LockState>();

function isMissingRelationError(err: unknown): boolean {
  const msg = String((err as any)?.message ?? "");
  const code = String((err as any)?.code ?? "");
  return code === "42P01" || /relation .* does not exist/i.test(msg);
}

function isMissingSessionsTableError(err: unknown): boolean {
  const msg = String((err as any)?.message ?? "");
  const code = String((err as any)?.code ?? "");
  return code === "42P01" || /auth_sessions/i.test(msg);
}

async function loadLockState(number: string): Promise<LockState> {
  const supabase = getSupabaseServerClient();
  try {
    const { data, error } = await supabase
      .from("auth_login_state")
      .select("number, fail_count, post_first_ban, locked_until")
      .eq("number", number)
      .maybeSingle();
    if (error) throw error;
    if (!data) return memoryLockState.get(number) ?? { number, fail_count: 0, post_first_ban: false, locked_until: null };
    return {
      number: String(data.number ?? number),
      fail_count: Number(data.fail_count ?? 0),
      post_first_ban: !!data.post_first_ban,
      locked_until: data.locked_until ? String(data.locked_until) : null
    };
  } catch (e) {
    if (!isMissingRelationError(e)) {
      console.warn("auth_login_state load failed, using memory fallback:", e);
    }
    return memoryLockState.get(number) ?? { number, fail_count: 0, post_first_ban: false, locked_until: null };
  }
}

async function saveLockState(state: LockState): Promise<void> {
  const supabase = getSupabaseServerClient();
  memoryLockState.set(state.number, state);
  try {
    const { error } = await supabase.from("auth_login_state").upsert(
      {
        number: state.number,
        fail_count: state.fail_count,
        post_first_ban: state.post_first_ban,
        locked_until: state.locked_until
      },
      { onConflict: "number" }
    );
    if (error) throw error;
  } catch (e) {
    if (!isMissingRelationError(e)) {
      console.warn("auth_login_state save failed, memory fallback only:", e);
    }
  }
}

async function logBan(params: {
  number: string;
  user_id: string | null;
  lock_hours: number;
  lock_until: string;
  reason: string;
}): Promise<void> {
  const payload = {
    number: params.number,
    user_id: params.user_id,
    lock_hours: params.lock_hours,
    lock_until: params.lock_until,
    reason: params.reason
  };
  console.warn("LOGIN_BAN_EVENT", payload);

  const supabase = getSupabaseServerClient();
  try {
    const { error } = await supabase.from("auth_login_logs").insert([payload]);
    if (error) throw error;
  } catch (e) {
    if (!isMissingRelationError(e)) {
      console.warn("auth_login_logs insert failed:", e);
    }
  }
}

function buildNumberCandidates(raw: string): string[] {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  const out = new Set<string>();
  if (trimmed) out.add(trimmed);
  if (digits) out.add(digits);

  // India format support, without forcing 10-digit numbers:
  // accept raw/with +91/with 91 prefix, even for shorter numbers.
  if (digits.startsWith("91") && digits.length > 2) {
    out.add(digits.slice(2));
    out.add(`+${digits}`);
  } else if (digits.length > 0) {
    out.add(`91${digits}`);
    out.add(`+91${digits}`);
  }
  return Array.from(out);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      number?: string;
      password?: string;
      rememberMe?: boolean;
    };

    const number = (body.number ?? "").trim();
    const password = String(body.password ?? "");
    const rememberMe = !!body.rememberMe;

    if (!number || !password) {
      return NextResponse.json({ ok: false, error: "Number and password are required." }, { status: 400 });
    }

    const lock = await loadLockState(number);
    const nowMs = Date.now();
    const lockedUntilMs = lock.locked_until ? new Date(lock.locked_until).getTime() : 0;
    if (lockedUntilMs > nowMs) {
      const remainingMin = Math.ceil((lockedUntilMs - nowMs) / (1000 * 60));
      return NextResponse.json(
        {
          ok: false,
          error: `Account is temporarily blocked. Try again in ${remainingMin} minute(s).`,
          blocked_until: new Date(lockedUntilMs).toISOString()
        },
        { status: 429 }
      );
    }

    const supabase = getSupabaseServerClient();
    const numberCandidates = buildNumberCandidates(number);
    const { data: users, error } = await supabase
      .from("users")
      .select("*")
      .in("number", numberCandidates)
      .limit(1);
    if (error) throw error;
    if (!users || users.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Number not found. Please contact admin." },
        { status: 404 }
      );
    }

    const user = users[0] as any;
    const authEmail = String(user?.auth_email ?? "").trim();
    let passwordOk = false;

    // Phase-2 compatible path: if auth_email is mapped, verify with Supabase Auth password.
    if (authEmail) {
      const { error: authErr } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password
      });
      passwordOk = !authErr;
    } else {
      if (!user.password) {
        return NextResponse.json(
          { ok: false, error: "Password not set for this account. Please contact admin." },
          { status: 400 }
        );
      }
      passwordOk = verifyPassword(password, user.password);
    }

    if (!passwordOk) {
      const threshold = lock.post_first_ban ? 3 : 5;
      const lockHours = lock.post_first_ban ? 2 : 1;
      const nextFail = lock.fail_count + 1;

      if (nextFail >= threshold) {
        const nextLockedUntil = new Date(nowMs + lockHours * 60 * 60 * 1000).toISOString();
        const nextState: LockState = {
          number,
          fail_count: 0,
          post_first_ban: true,
          locked_until: nextLockedUntil
        };
        await saveLockState(nextState);
        await logBan({
          number,
          user_id: user?.id == null ? null : String(user.id),
          lock_hours: lockHours,
          lock_until: nextLockedUntil,
          reason: `Failed password threshold reached (${threshold})`
        });
        return NextResponse.json(
          {
            ok: false,
            error: `Too many wrong attempts. Account blocked for ${lockHours} hour(s).`,
            blocked_until: nextLockedUntil
          },
          { status: 429 }
        );
      }

      const remaining = threshold - nextFail;
      await saveLockState({
        number,
        fail_count: nextFail,
        post_first_ban: lock.post_first_ban,
        locked_until: null
      });
      return NextResponse.json(
        { ok: false, error: `Incorrect password. ${remaining} attempt(s) left.` },
        { status: 401 }
      );
    }

    if (!authEmail && !isPasswordHashed(user.password)) {
      const nextHash = hashPassword(password);
      await supabase.from("users").update({ password: nextHash }).eq("id", user.id);
    }

    // Success: reset counter and unlock.
    await saveLockState({
      number,
      fail_count: 0,
      post_first_ban: lock.post_first_ban,
      locked_until: null
    });

    let session: { token: string; expiresAtIso: string };
    try {
      session = await issueAuthSession({
        userId: String(user.id),
        rememberMe
      });
    } catch (e) {
      if (isMissingSessionsTableError(e)) {
        return NextResponse.json(
          {
            ok: false,
            error:
              'Security tables are not set up in Supabase. Run "web/AUTH_SECURITY_SCHEMA.sql" in Supabase SQL Editor.'
          },
          { status: 501 }
        );
      }
      throw e;
    }

    const response = NextResponse.json({
      ok: true,
      access_token: session.token,
      user: {
        id: String(user.id),
        name: String(user.number),
        username: String(user.username ?? user.number),
        access_level: String(user.access_level ?? "Viewer")
      }
    });
    response.cookies.set("bh_access_token", session.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      expires: new Date(session.expiresAtIso)
    });
    return response;
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}

