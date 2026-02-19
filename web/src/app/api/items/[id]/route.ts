import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServerClient";
import { requireAuth } from "@/lib/serverAuth";

function parseId(idRaw: string): string | number {
  const n = Number(idRaw);
  return Number.isFinite(n) ? n : idRaw;
}

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(_request, ["admin", "manager"]);
    if (!auth.ok) return auth.response;

    const { id } = await ctx.params;
    const itemId = parseId(id);
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase.from("items").select("*").eq("id", itemId).single();
    if (error) throw error;
    return NextResponse.json({ ok: true, item: data });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request, ["admin", "manager"]);
    if (!auth.ok) return auth.response;

    const { id } = await ctx.params;
    const itemId = parseId(id);
    const body = (await request.json().catch(() => null)) as
      | null
      | {
          username?: string;
          cancelled?: boolean;
          price?: number;
          createIfMissing?: boolean;
        };

    if (!body || (body.username == null && body.cancelled == null && body.price == null)) {
      return NextResponse.json({ ok: false, error: "Missing patch fields" }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();

    if (typeof body.username === "string") {
      const nextUsername = body.username.trim();
      if (!nextUsername) {
        return NextResponse.json({ ok: false, error: "username cannot be empty" }, { status: 400 });
      }

      if (body.createIfMissing) {
        const { data: existing, error: checkErr } = await supabase
          .from("users")
          .select("id")
          .eq("username", nextUsername);
        if (checkErr) throw checkErr;
        const isNew = !existing || existing.length === 0;
        if (isNew) {
          const { error: createErr } = await supabase.from("users").insert([
            { username: nextUsername, password: "", number: "", access_level: "viewer" }
          ]);
          if (createErr) throw createErr;
        }
      }

      const { error: updErr } = await supabase
        .from("items")
        .update({ username: nextUsername })
        .eq("id", itemId);
      if (updErr) throw updErr;
    }

    if (typeof body.cancelled === "boolean") {
      const { error: updErr } = await supabase
        .from("items")
        .update({ cancelled: body.cancelled })
        .eq("id", itemId);
      if (updErr) throw updErr;
    }

    if (typeof body.price === "number") {
      if (!Number.isFinite(body.price) || body.price < 0) {
        return NextResponse.json({ ok: false, error: "Invalid price" }, { status: 400 });
      }
      // Store as-is; UI enforces integers/no-decimals.
      const { error: updErr } = await supabase
        .from("items")
        .update({ price: body.price })
        .eq("id", itemId);
      if (updErr) throw updErr;
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
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
    const auth = await requireAuth(_request, ["admin", "manager"]);
    if (!auth.ok) return auth.response;

    const { id } = await ctx.params;
    const itemId = parseId(id);
    const supabase = getSupabaseServerClient();
    const { error } = await supabase.from("items").delete().eq("id", itemId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}

