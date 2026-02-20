import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServerClient";
import { requireAuth } from "@/lib/serverAuth";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireAuth(request, ["admin", "manager"]);
    if (!auth.ok) return auth.response;

    const watcherId = params.id;
    const supabase = getSupabaseServerClient();

    // First get the post_url from the watcher
    const { data: watcher, error: watcherError } = await supabase
        .from('bidding_watchers')
        .select('post_url')
        .eq('id', watcherId)
        .single();
    
    if (watcherError || !watcher) {
        return NextResponse.json({ ok: false, error: "Watcher not found" }, { status: 404 });
    }

    const { data: bids, error } = await supabase
      .from("bidding_bids")
      .select("*")
      .eq("post_url", watcher.post_url)
      .order("timestamp", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ ok: true, bids: bids || [] });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
