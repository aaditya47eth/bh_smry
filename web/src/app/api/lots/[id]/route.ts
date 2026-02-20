import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServerClient";
import { requireAuth } from "@/lib/serverAuth";

function parseId(params: { id?: string }): number | null {
  const raw = params.id ?? "";
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(request, ["admin", "manager"]);
    if (!auth.ok) return auth.response;

    const id = parseId(params);
    if (!id) {
      return NextResponse.json({ ok: false, error: "Invalid lot id" }, { status: 400 });
    }

    const body = (await request.json()) as {
      lot_name?: string;
      description?: string | null;
      locked?: boolean;
      created_at?: string;
    };

    const updates: Record<string, unknown> = {};
    if (typeof body.locked === "boolean") updates.locked = body.locked;
    if (body.created_at !== undefined) updates.created_at = body.created_at;
    if (body.lot_name !== undefined) {
      const lotName = (body.lot_name ?? "").trim();
      if (!lotName) {
        return NextResponse.json(
          { ok: false, error: "lot_name is required" },
          { status: 400 }
        );
      }
      updates.lot_name = lotName;
    }
    if (body.description !== undefined) {
      updates.description = (body.description ?? null) || null;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { ok: false, error: "No fields to update" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("lots")
      .update(updates)
      .eq("id", id)
      .select("id, lot_name, description, locked, created_at")
      .single();

    if (error) throw error;
    return NextResponse.json({ ok: true, lot: data });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(_request, ["admin", "manager"]);
    if (!auth.ok) return auth.response;

    const id = parseId(params);
    if (!id) {
      return NextResponse.json({ ok: false, error: "Invalid lot id" }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();

    // Delete items first to avoid FK constraint issues (legacy behavior is "delete lot").
    const { error: itemsErr } = await supabase.from("items").delete().eq("lot_id", id);
    if (itemsErr) throw itemsErr;

    const { error: lotErr } = await supabase.from("lots").delete().eq("id", id);
    if (lotErr) throw lotErr;

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}

