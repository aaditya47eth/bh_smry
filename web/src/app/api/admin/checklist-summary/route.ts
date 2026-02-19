import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServerClient";
import { requireAuth } from "@/lib/serverAuth";

type LotRow = {
  id: number | string;
  lot_name: string;
};

type ItemRow = {
  id: number | string;
  lot_id: number | string | null;
  checked: boolean | null;
  checklist_status: string | null;
  cancelled?: boolean | null;
  lots?: { lot_name?: string | null } | null;
};

type LotSummary = {
  lotId: string;
  lotName: string;
  totalItems: number;
  checkedItems: number;
  pendingItems: number;
};

function isChecked(row: ItemRow): boolean {
  const status = (row.checklist_status ?? "").toLowerCase();
  if (status === "checked") return true;
  // "rejected" (cross) is treated as completed/done for checklist summary.
  // Only "unchecked" counts as pending.
  if (status === "rejected") return true;
  if (status === "unchecked") return false;
  return !!row.checked;
}

async function fetchAllChecklistRows(supabase: ReturnType<typeof getSupabaseServerClient>) {
  const PAGE_SIZE = 1000;
  let lastId: number | null = null;
  const all: ItemRow[] = [];

  while (true) {
    let query = supabase
      .from("items")
      .select("id, lot_id, checked, checklist_status, cancelled, lots(lot_name)")
      .order("id", { ascending: true })
      .limit(PAGE_SIZE);

    if (lastId != null) query = query.gt("id", lastId);

    const { data, error } = await query;

    if (error) throw error;
    const rows = (data ?? []) as ItemRow[];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    const nextCursor = Number(rows[rows.length - 1]?.id);
    if (!Number.isFinite(nextCursor)) break;
    lastId = nextCursor;
  }

  return all;
}

async function fetchAllLots(supabase: ReturnType<typeof getSupabaseServerClient>) {
  const PAGE_SIZE = 1000;
  let lastId: number | null = null;
  const all: LotRow[] = [];

  while (true) {
    let query = supabase
      .from("lots")
      .select("id, lot_name")
      .order("id", { ascending: true })
      .limit(PAGE_SIZE);

    if (lastId != null) query = query.gt("id", lastId);

    const { data, error } = await query;

    if (error) throw error;
    const rows = (data ?? []) as LotRow[];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    const nextCursor = Number(rows[rows.length - 1]?.id);
    if (!Number.isFinite(nextCursor)) break;
    lastId = nextCursor;
  }

  return all;
}

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request, ["admin", "manager"]);
    if (!auth.ok) return auth.response;

    const supabase = getSupabaseServerClient();
    const [lotsData, itemsData] = await Promise.all([
      fetchAllLots(supabase),
      fetchAllChecklistRows(supabase)
    ]);

    const map = new Map<string, LotSummary>();
    // Seed all lots (so checklist includes every lot, even if it has 0 items)
    for (const lot of lotsData) {
      const lotId = String(lot.id);
      map.set(lotId, {
        lotId,
        lotName: lot.lot_name,
        totalItems: 0,
        checkedItems: 0,
        pendingItems: 0
      });
    }

    for (const row of (itemsData ?? []) as ItemRow[]) {
      if (row.cancelled) continue;
      const lotId = row.lot_id == null ? null : String(row.lot_id);
      if (!lotId) continue;

      const lotName =
        (row.lots?.lot_name ?? map.get(lotId)?.lotName ?? `Lot ${lotId}`).toString();
      const agg =
        map.get(lotId) ??
        ({
          lotId,
          lotName,
          totalItems: 0,
          checkedItems: 0,
          pendingItems: 0
        } as LotSummary);

      agg.totalItems += 1;
      if (isChecked(row)) agg.checkedItems += 1;
      map.set(lotId, agg);
    }

    const lots = Array.from(map.values()).map((l) => ({
      ...l,
      pendingItems: Math.max(0, l.totalItems - l.checkedItems)
    }));

    const completed = lots.filter((l) => l.totalItems > 0 && l.pendingItems === 0);
    const incomplete = lots.filter((l) => l.totalItems > 0 && l.checkedItems === 0);
    const partial = lots.filter(
      (l) => l.totalItems > 0 && l.checkedItems > 0 && l.pendingItems > 0
    );
    const empty = lots.filter((l) => l.totalItems === 0);

    // Sort by numeric suffix if present, else name
    const sortLots = (a: LotSummary, b: LotSummary) => {
      const numA = parseInt(a.lotName.match(/(\d+)$/)?.[1] || "0", 10);
      const numB = parseInt(b.lotName.match(/(\d+)$/)?.[1] || "0", 10);
      if (numA && numB) return numB - numA;
      return a.lotName.localeCompare(b.lotName);
    };

    completed.sort(sortLots);
    incomplete.sort(sortLots);
    partial.sort(sortLots);
    empty.sort(sortLots);

    return NextResponse.json({
      ok: true,
      partial,
      incomplete,
      completed,
      empty
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}

