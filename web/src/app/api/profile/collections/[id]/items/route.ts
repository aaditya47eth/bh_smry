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

function isMissingTableError(err: any): boolean {
  const msg = (err?.message ?? "").toString().toLowerCase();
  if (!msg.includes("does not exist")) return false;
  return msg.includes("profile_collections") || msg.includes("profile_collection_items");
}

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(_request, ["admin", "manager", "viewer"]);
    if (!auth.ok) return auth.response;

    const { id } = await ctx.params;
    const collectionId = Number(id);
    if (!Number.isFinite(collectionId)) {
      return NextResponse.json({ ok: false, error: "Invalid collection id" }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    const { data: colOwner, error: colOwnerErr } = await supabase
      .from("profile_collections")
      .select("owner_username")
      .eq("id", collectionId)
      .maybeSingle();
    if (colOwnerErr) throw colOwnerErr;
    if (!colOwner) {
      return NextResponse.json({ ok: false, error: "Collection not found" }, { status: 404 });
    }
    const owner = String((colOwner as any).owner_username ?? "");
    const isSelf = owner === auth.user.username;
    if (!isSelf && !["admin", "manager"].includes(auth.level)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const { data: mapping, error: mapErr } = await supabase
      .from("profile_collection_items")
      .select("item_id")
      .eq("collection_id", collectionId)
      .order("id", { ascending: true });
    if (mapErr) throw mapErr;

    const itemIds = (mapping ?? [])
      .map((r: any) => Number(r.item_id))
      .filter((n: number) => Number.isFinite(n));

    if (itemIds.length === 0) {
      return NextResponse.json({ ok: true, itemIds: [], items: [] });
    }

    const { data: items, error: itemsErr } = await supabase
      .from("items")
      .select("id, lot_id, username, picture_url, price, cancelled, created_at, lots(lot_name, created_at)")
      .in("id", itemIds)
      .or("cancelled.is.null,cancelled.eq.false");
    if (itemsErr) throw itemsErr;

    // Preserve mapping order
    const byId = new Map<string, ItemRow>();
    for (const it of (items ?? []) as ItemRow[]) byId.set(String(it.id), it);
    const ordered = itemIds.map((id2) => byId.get(String(id2))).filter(Boolean) as ItemRow[];

    return NextResponse.json({ ok: true, itemIds: itemIds.map(String), items: ordered });
  } catch (err: any) {
    if (isMissingTableError(err)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Collections tables are not set up in Supabase yet. Run "web/PROFILE_COLLECTIONS_SCHEMA.sql" in Supabase SQL Editor.'
        },
        { status: 501 }
      );
    }
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(request, ["admin", "manager", "viewer"]);
    if (!auth.ok) return auth.response;

    const { id } = await ctx.params;
    const collectionId = Number(id);
    if (!Number.isFinite(collectionId)) {
      return NextResponse.json({ ok: false, error: "Invalid collection id" }, { status: 400 });
    }

    const body = (await request.json().catch(() => null)) as null | { item_id?: number | string };
    const itemId = Number(body?.item_id);
    if (!Number.isFinite(itemId)) {
      return NextResponse.json({ ok: false, error: "Invalid item_id" }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    const { data: colOwner, error: colOwnerErr } = await supabase
      .from("profile_collections")
      .select("owner_username")
      .eq("id", collectionId)
      .maybeSingle();
    if (colOwnerErr) throw colOwnerErr;
    if (!colOwner) {
      return NextResponse.json({ ok: false, error: "Collection not found" }, { status: 404 });
    }
    const owner = String((colOwner as any).owner_username ?? "");
    const isSelf = owner === auth.user.username;
    if (!isSelf && !["admin", "manager"].includes(auth.level)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const { error } = await supabase.from("profile_collection_items").insert([
      { collection_id: collectionId, item_id: itemId }
    ]);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (isMissingTableError(err)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Collections tables are not set up in Supabase yet. Run "web/PROFILE_COLLECTIONS_SCHEMA.sql" in Supabase SQL Editor.'
        },
        { status: 501 }
      );
    }
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(request, ["admin", "manager", "viewer"]);
    if (!auth.ok) return auth.response;

    const { id } = await ctx.params;
    const collectionId = Number(id);
    if (!Number.isFinite(collectionId)) {
      return NextResponse.json({ ok: false, error: "Invalid collection id" }, { status: 400 });
    }

    const url = new URL(request.url);
    const itemId = Number(url.searchParams.get("item_id"));
    if (!Number.isFinite(itemId)) {
      return NextResponse.json({ ok: false, error: "item_id query param is required" }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    const { data: colOwner, error: colOwnerErr } = await supabase
      .from("profile_collections")
      .select("owner_username")
      .eq("id", collectionId)
      .maybeSingle();
    if (colOwnerErr) throw colOwnerErr;
    if (!colOwner) {
      return NextResponse.json({ ok: false, error: "Collection not found" }, { status: 404 });
    }
    const owner = String((colOwner as any).owner_username ?? "");
    const isSelf = owner === auth.user.username;
    if (!isSelf && !["admin", "manager"].includes(auth.level)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const { error } = await supabase
      .from("profile_collection_items")
      .delete()
      .eq("collection_id", collectionId)
      .eq("item_id", itemId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (isMissingTableError(err)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Collections tables are not set up in Supabase yet. Run "web/PROFILE_COLLECTIONS_SCHEMA.sql" in Supabase SQL Editor.'
        },
        { status: 501 }
      );
    }
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}

