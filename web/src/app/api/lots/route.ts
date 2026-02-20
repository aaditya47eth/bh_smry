import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServerClient";
import { requireAuth } from "@/lib/serverAuth";

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request, ["admin", "manager", "viewer"]);
    if (!auth.ok) return auth.response;

    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("lots")
      .select("id, lot_name, created_at, locked")
      .order("created_at", { ascending: false });
    if (error) throw error;

    const lots = (data ?? []) as Array<{ id: number | string } & Record<string, any>>;
    if (lots.length === 0) return NextResponse.json({ ok: true, lots: [] });

    // Hide lots where every item is cancelled (but keep lots with zero items).
    // Scope to visible lot ids so we don't scan unrelated item rows.
    const lotIds = lots
      .map((l) => Number(l.id))
      .filter((id) => Number.isFinite(id));
    const { data: itemRows, error: itemErr } = await supabase
      .from("items")
      .select("lot_id, cancelled")
      .in("lot_id", lotIds);
    if (itemErr) throw itemErr;

    const stats = new Map<string, { total: number; active: number }>();
    for (const r of (itemRows ?? []) as Array<{ lot_id: number | string | null; cancelled?: boolean | null }>) {
      if (r.lot_id == null) continue;
      const key = String(r.lot_id);
      const cur = stats.get(key) ?? { total: 0, active: 0 };
      cur.total += 1;
      if (!r.cancelled) cur.active += 1;
      stats.set(key, cur);
    }

    const filtered = lots.filter((l) => {
      const s = stats.get(String(l.id));
      if (!s) return true; // no items -> keep lot
      return s.active > 0; // drop only all-cancelled lots
    });

    return NextResponse.json({ ok: true, lots: filtered });
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

    const body = (await request.json()) as {
      lot_name?: string;
      description?: string | null;
      created_by_user_id?: string | null;
    };

    const lotName = (body.lot_name ?? "").trim();
    if (!lotName) {
      return NextResponse.json(
        { ok: false, error: "lot_name is required" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServerClient();
    const { error } = await supabase.from("lots").insert([
      {
        lot_name: lotName,
        description: (body.description ?? null) || null,
        created_by_user_id: body.created_by_user_id ?? null,
        // Keep DB-compatible default without exposing any status UI.
        status: "Going on"
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

