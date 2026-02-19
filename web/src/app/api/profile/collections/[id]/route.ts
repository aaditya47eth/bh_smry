import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServerClient";
import { requireAuth } from "@/lib/serverAuth";

function isMissingTableError(err: any): boolean {
  const msg = (err?.message ?? "").toString().toLowerCase();
  if (!msg.includes("does not exist")) return false;
  return msg.includes("profile_collections") || msg.includes("profile_collection_items");
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request, ["admin", "manager", "viewer"]);
    if (!auth.ok) return auth.response;

    const { id } = await ctx.params;
    const body = (await request.json().catch(() => null)) as null | { name?: string };
    const name = (body?.name || "").trim();
    if (!name) {
      return NextResponse.json({ ok: false, error: "name is required" }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    const { data: colOwner, error: colOwnerErr } = await supabase
      .from("profile_collections")
      .select("owner_username")
      .eq("id", Number(id))
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
      .from("profile_collections")
      .update({ name, updated_at: new Date().toISOString() })
      .eq("id", Number(id));
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

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(_request, ["admin", "manager", "viewer"]);
    if (!auth.ok) return auth.response;

    const { id } = await ctx.params;
    const supabase = getSupabaseServerClient();
    const { data: colOwner, error: colOwnerErr } = await supabase
      .from("profile_collections")
      .select("owner_username")
      .eq("id", Number(id))
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

    const { error } = await supabase.from("profile_collections").delete().eq("id", Number(id));
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

