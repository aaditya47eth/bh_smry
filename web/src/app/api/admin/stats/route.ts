import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServerClient";
import { requireAuth } from "@/lib/serverAuth";

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request, ["admin", "manager"]);
    if (!auth.ok) return auth.response;

    const supabase = getSupabaseServerClient();

    const [{ count: usersCount, error: usersErr }, { count: lotsCount, error: lotsErr }, { count: itemsCount, error: itemsErr }] =
      await Promise.all([
        supabase.from("users").select("*", { count: "exact", head: true }),
        supabase.from("lots").select("*", { count: "exact", head: true }),
        supabase.from("items").select("*", { count: "exact", head: true })
      ]);

    if (usersErr) throw usersErr;
    if (lotsErr) throw lotsErr;
    if (itemsErr) throw itemsErr;

    return NextResponse.json({
      ok: true,
      counts: {
        users: usersCount ?? 0,
        lots: lotsCount ?? 0,
        items: itemsCount ?? 0
      }
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}

