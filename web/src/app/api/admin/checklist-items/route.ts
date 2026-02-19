import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServerClient";
import { requireAuth } from "@/lib/serverAuth";

type ChecklistItemRow = {
  id: number | string;
  picture_url: string | null;
  checked: boolean | null;
  checklist_status: string | null;
  created_at: string | null;
  cancelled?: boolean | null;
};

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request, ["admin", "manager"]);
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
    const PAGE_SIZE = 1000;
    let lastId: number | null = null;
    const all: ChecklistItemRow[] = [];

    while (true) {
      let query = supabase
        .from("items")
        .select("id, picture_url, checked, checklist_status, created_at, cancelled")
        .eq("lot_id", lotId)
        // Keep it consistent with summary: treat cancelled null as not-cancelled.
        .or("cancelled.is.null,cancelled.eq.false")
        .order("id", { ascending: true })
        .limit(PAGE_SIZE);

      if (lastId != null) query = query.gt("id", lastId);

      const { data, error } = await query;

      if (error) throw error;
      const rows = (data ?? []) as ChecklistItemRow[];
      all.push(...rows);
      if (rows.length < PAGE_SIZE) break;
      const nextCursor = Number(rows[rows.length - 1]?.id);
      if (!Number.isFinite(nextCursor)) break;
      lastId = nextCursor;
    }

    // Preserve legacy gallery ordering.
    all.sort((a, b) => {
      const ca = a.created_at ?? "";
      const cb = b.created_at ?? "";
      if (ca !== cb) return ca.localeCompare(cb);
      return Number(a.id) - Number(b.id);
    });

    // Do not return cancelled in response payload (UI doesn't need it).
    const items = all.map(({ cancelled: _c, ...rest }) => rest);
    return NextResponse.json({ ok: true, items });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}

