import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServerClient";
import { requireAuth } from "@/lib/serverAuth";

type CollectionRow = {
  id: number | string;
  owner_username: string;
  name: string;
  created_at: string | null;
  updated_at: string | null;
};

function isMissingTableError(err: any): boolean {
  const msg = (err?.message ?? "").toString().toLowerCase();
  if (!msg.includes("does not exist")) return false;
  return msg.includes("profile_collections") || msg.includes("profile_collection_items");
}

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request, ["admin", "manager", "viewer"]);
    if (!auth.ok) return auth.response;

    const url = new URL(request.url);
    const username = (url.searchParams.get("username") || "").trim();
    if (!username) {
      return NextResponse.json({ ok: false, error: "username is required" }, { status: 400 });
    }

    const isSelf = auth.user.username === username;
    if (!isSelf && !["admin", "manager"].includes(auth.level)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("profile_collections")
      .select("id, owner_username, name, created_at, updated_at")
      .eq("owner_username", username)
      .order("updated_at", { ascending: false });
    if (error) throw error;

    const collections = (data ?? []) as CollectionRow[];

    // Fetch mapping rows to compute counts (avoid relying on FK embed config).
    const ids = collections.map((c) => Number(c.id)).filter((n) => Number.isFinite(n));
    const counts = new Map<string, number>();
    if (ids.length > 0) {
      const { data: mapRows, error: mapErr } = await supabase
        .from("profile_collection_items")
        .select("collection_id")
        .in("collection_id", ids);
      if (mapErr) throw mapErr;
      for (const r of (mapRows ?? []) as Array<{ collection_id: number | string }>) {
        const k = String(r.collection_id);
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
    }

    return NextResponse.json({
      ok: true,
      collections: collections.map((c) => ({
        id: String(c.id),
        name: c.name,
        itemCount: counts.get(String(c.id)) ?? 0
      }))
    });
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

export async function POST(request: Request) {
  try {
    const auth = await requireAuth(request, ["admin", "manager", "viewer"]);
    if (!auth.ok) return auth.response;

    const body = (await request.json().catch(() => null)) as
      | null
      | { username?: string; name?: string };
    const username = (body?.username || "").trim();
    const name = (body?.name || "").trim();
    if (!username) {
      return NextResponse.json({ ok: false, error: "username is required" }, { status: 400 });
    }
    if (!name) {
      return NextResponse.json({ ok: false, error: "name is required" }, { status: 400 });
    }

    const isSelf = auth.user.username === username;
    if (!isSelf && !["admin", "manager"].includes(auth.level)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const supabase = getSupabaseServerClient();
    const { error } = await supabase.from("profile_collections").insert([
      { owner_username: username, name }
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

