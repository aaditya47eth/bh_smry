import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServerClient";
import { requireAuth } from "@/lib/serverAuth";

type ItemRow = {
  id: number | string;
  lot_id: number | string | null;
  username: string | null;
  price: string | number | null;
  cancelled: boolean | null;
  lots?: { lot_name?: string | null; created_at?: string | null } | null;
};

function toNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

async function fetchAllItemsForStats(supabase: ReturnType<typeof getSupabaseServerClient>) {
  // PostgREST commonly defaults to returning only the first ~1000 rows.
  const PAGE_SIZE = 1000;
  let lastId: number | null = null;
  const all: ItemRow[] = [];

  while (true) {
    let query = supabase
      .from("items")
      .select("id, lot_id, username, price, cancelled, lots(lot_name, created_at)")
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

function monthYearKey(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (!Number.isFinite(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request, ["admin", "manager"]);
    if (!auth.ok) return auth.response;

    const url = new URL(request.url);
    const month = (url.searchParams.get("month") || "all").trim(); // YYYY-MM | all

    const supabase = getSupabaseServerClient();

    // Pull only the columns we need for stats.
    const data = await fetchAllItemsForStats(supabase);
    let items = data.filter((it) => !it.cancelled);

    if (month !== "all") {
      items = items.filter((it) => monthYearKey(it.lots?.created_at ?? null) === month);
    }

    // ----------------------
    // Lot-wise aggregation
    // ----------------------
    const lotMap = new Map<
      string,
      {
        lotId: string;
        lotName: string;
        participants: Set<string>;
        totalItems: number;
        amount: number;
      }
    >();

    // ----------------------
    // Person-wise aggregation
    // ----------------------
    const userMap = new Map<
      string,
      { username: string; lots: Set<string>; totalItems: number; amount: number }
    >();

    const globalParticipants = new Set<string>();
    let globalItems = 0;
    let globalAmount = 0;

    for (const it of items) {
      const lotId = it.lot_id == null ? "unknown" : String(it.lot_id);
      const lotName = (it.lots?.lot_name ?? `Lot ${lotId}`).toString();
      const username = (it.username ?? "Unknown").toString();
      const price = toNumber(it.price);

      globalParticipants.add(username);
      globalItems += 1;
      globalAmount += price;

      // lot-wise
      const lotKey = lotId;
      const lotAgg =
        lotMap.get(lotKey) ??
        ({
          lotId,
          lotName,
          participants: new Set<string>(),
          totalItems: 0,
          amount: 0
        } as {
          lotId: string;
          lotName: string;
          participants: Set<string>;
          totalItems: number;
          amount: number;
        });
      lotAgg.participants.add(username);
      lotAgg.totalItems += 1;
      lotAgg.amount += price;
      lotMap.set(lotKey, lotAgg);

      // person-wise
      const userAgg =
        userMap.get(username) ??
        ({
          username,
          lots: new Set<string>(),
          totalItems: 0,
          amount: 0
        } as {
          username: string;
          lots: Set<string>;
          totalItems: number;
          amount: number;
        });
      userAgg.lots.add(lotKey);
      userAgg.totalItems += 1;
      userAgg.amount += price;
      userMap.set(username, userAgg);
    }

    const lotWiseRows = Array.from(lotMap.values()).map((l) => ({
      lotId: l.lotId,
      lotName: l.lotName,
      participants: l.participants.size,
      totalItems: l.totalItems,
      amount: Math.round(l.amount)
    }));

    // Sort by numeric suffix like legacy (desc)
    lotWiseRows.sort((a, b) => {
      const numA = parseInt(String(a.lotName).match(/(\d+)$/)?.[1] || "0", 10);
      const numB = parseInt(String(b.lotName).match(/(\d+)$/)?.[1] || "0", 10);
      return numB - numA;
    });

    const personWiseRows = Array.from(userMap.values()).map((u) => ({
      username: u.username,
      lotsParticipated: u.lots.size,
      amount: Math.round(u.amount),
      figsCollected: u.totalItems
    }));

    // Sort username asc like legacy
    personWiseRows.sort((a, b) => a.username.localeCompare(b.username));

    return NextResponse.json({
      ok: true,
      lotWise: {
        summary: {
          totalLots: lotWiseRows.length,
          totalParticipants: globalParticipants.size,
          totalItems: globalItems,
          totalAmount: Math.round(globalAmount)
        },
        rows: lotWiseRows
      },
      personWise: {
        summary: {
          totalCollectors: personWiseRows.length,
          totalAmount: Math.round(globalAmount),
          totalFigs: globalItems
        },
        rows: personWiseRows
      }
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}

