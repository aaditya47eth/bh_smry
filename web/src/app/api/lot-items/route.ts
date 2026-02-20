import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServerClient";
import { requireAuth } from "@/lib/serverAuth";

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request, ["admin", "manager", "viewer"]);
    if (!auth.ok) return auth.response;

    const url = new URL(request.url);
    const lotIdRaw = url.searchParams.get("lot_id");
    const lotId = lotIdRaw ? Number(lotIdRaw) : NaN;

    if (!Number.isFinite(lotId)) {
      return NextResponse.json(
        { ok: false, error: "lot_id query param is required" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("items")
      .select("id, lot_id, username, picture_url, price, cancelled, created_at")
      .eq("lot_id", lotId)
      .order("created_at", { ascending: true });

    if (error) throw error;

    const rows = (data ?? []) as Array<Record<string, any>>;
    if (auth.level === "viewer") {
      const currentUsername = (auth.user.username || "").trim();
      const sanitized = rows.map((it) => {
        const own = (it.username ?? "").toString().trim() === currentUsername;
        if (own) return it;
        return {
          ...it,
          username: null,
          price: null
        };
      });
      return NextResponse.json({ ok: true, items: sanitized });
    }

    return NextResponse.json({ ok: true, items: rows });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}

