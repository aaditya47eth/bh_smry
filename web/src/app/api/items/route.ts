import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServerClient";
import { requireAuth } from "@/lib/serverAuth";

type PostBody = {
  lot_id?: number;
  username?: string;
  picture_url?: string;
  price?: number;
  create_if_missing?: boolean;
};

export async function POST(request: Request) {
  try {
    const auth = await requireAuth(request, ["admin", "manager"]);
    if (!auth.ok) return auth.response;

    const body = (await request.json().catch(() => null)) as PostBody | null;
    const lotId = Number(body?.lot_id);
    const username = (body?.username ?? "").trim();
    const pictureUrl = (body?.picture_url ?? "").trim();
    const price = Number(body?.price);
    const createIfMissing = !!body?.create_if_missing;

    if (!Number.isFinite(lotId)) {
      return NextResponse.json({ ok: false, error: "Invalid lot_id" }, { status: 400 });
    }
    if (!username) {
      return NextResponse.json({ ok: false, error: "username is required" }, { status: 400 });
    }
    if (!/^https?:\/\//i.test(pictureUrl)) {
      return NextResponse.json({ ok: false, error: "Invalid picture_url" }, { status: 400 });
    }
    if (!Number.isFinite(price) || price <= 0) {
      return NextResponse.json({ ok: false, error: "Invalid price" }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();

    if (createIfMissing) {
      const { data: existing, error: checkErr } = await supabase
        .from("users")
        .select("id")
        .eq("username", username)
        .limit(1);
      if (checkErr) throw checkErr;
      if (!existing || existing.length === 0) {
        const { error: createErr } = await supabase.from("users").insert([
          { username, password: "", number: "", access_level: "viewer" }
        ]);
        if (createErr) throw createErr;
      }
    }

    const { data, error } = await supabase
      .from("items")
      .insert([{ lot_id: lotId, username, picture_url: pictureUrl, price }])
      .select("id")
      .single();
    if (error) throw error;

    return NextResponse.json({ ok: true, id: data?.id ?? null });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}

