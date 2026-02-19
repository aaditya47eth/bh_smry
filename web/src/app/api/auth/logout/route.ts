import { NextResponse } from "next/server";
import { revokeAuthSessionByToken } from "@/lib/serverAuth";

function getTokenFromCookie(request: Request): string {
  const cookie = request.headers.get("cookie") ?? "";
  const m = cookie.match(/(?:^|;\s*)bh_access_token=([^;]+)/);
  return m?.[1] ? decodeURIComponent(m[1]) : "";
}

export async function POST(request: Request) {
  try {
    const token = getTokenFromCookie(request);
    if (token) {
      await revokeAuthSessionByToken(token);
    }
    const res = NextResponse.json({ ok: true });
    res.cookies.set("bh_access_token", "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0
    });
    return res;
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}

