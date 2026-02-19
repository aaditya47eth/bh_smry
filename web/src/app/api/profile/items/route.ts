import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServerClient";
import { requireAuth } from "@/lib/serverAuth";

type ItemRow = {
  id: number | string;
  lot_id: number | string | null;
  username: string | null;
  picture_url: string | null;
  price: string | number | null;
  cancelled: boolean | null;
  created_at: string | null;
  lots?: { lot_name?: string | null; created_at?: string | null } | null;
};

async function fetchAllForUser(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  username: string
): Promise<ItemRow[]> {
  const PAGE_SIZE = 1000;
  let from = 0;
  const all: ItemRow[] = [];

  while (true) {
    let query = supabase
      .from("items")
      .select(
        "id, lot_id, username, picture_url, price, cancelled, created_at, lots(lot_name, created_at)"
      )
      .eq("username", username)
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    // Profile view shows only active (non-cancelled) items.
    query = query.eq("cancelled", false);

    const { data, error } = await query;
    if (error) throw error;
    const rows = (data ?? []) as ItemRow[];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return all;
}

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request, ["admin", "manager", "viewer"]);
    if (!auth.ok) return auth.response;

    const url = new URL(request.url);
    const username = (url.searchParams.get("username") || "").trim();

    if (!username) {
      return NextResponse.json(
        { ok: false, error: "username query param is required" },
        { status: 400 }
      );
    }

    const isSelf = auth.user.username === username;
    if (!isSelf && !["admin", "manager"].includes(auth.level)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const supabase = getSupabaseServerClient();
    const items = await fetchAllForUser(supabase, username);

    // Sort newest lots first, then newest items
    items.sort((a, b) => {
      const lotA = a.lots?.created_at ?? "";
      const lotB = b.lots?.created_at ?? "";
      if (lotA !== lotB) return lotB.localeCompare(lotA);
      return (b.created_at ?? "").localeCompare(a.created_at ?? "");
    });

    return NextResponse.json({ ok: true, items });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}

