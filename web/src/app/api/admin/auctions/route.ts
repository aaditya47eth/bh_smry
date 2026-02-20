import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServerClient";
import { requireAuth } from "@/lib/serverAuth";

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request, ["admin", "manager"]);
    if (!auth.ok) return auth.response;

    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("bidding_watchers")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ ok: true, watchers: data || [] });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth(request, ["admin", "manager"]);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { postUrl, intervalSec } = body;

    if (!postUrl) {
      return NextResponse.json({ ok: false, error: "Missing postUrl" }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    
    // Check if watcher exists for this user/post
    const { data: existing } = await supabase
        .from('bidding_watchers')
        .select('id')
        .eq('post_url', postUrl)
        .eq('created_by', auth.user.username)
        .single();

    let error;
    if (existing) {
        const { error: updateError } = await supabase
            .from('bidding_watchers')
            .update({ 
                is_running: true, 
                interval_sec: intervalSec || 120,
                my_name: auth.user.name || auth.user.username 
            })
            .eq('id', existing.id);
        error = updateError;
    } else {
        const { error: insertError } = await supabase
            .from('bidding_watchers')
            .insert([{
                post_url: postUrl,
                my_name: auth.user.name || auth.user.username,
                interval_sec: intervalSec || 120,
                is_running: true,
                created_by: auth.user.username
            }]);
        error = insertError;
    }

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireAuth(request, ["admin", "manager"]);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { id, is_running } = body;

    if (!id) {
      return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    const { error } = await supabase
      .from("bidding_watchers")
      .update({ is_running })
      .eq("id", id);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
    try {
      const auth = await requireAuth(request, ["admin", "manager"]);
      if (!auth.ok) return auth.response;
  
      const url = new URL(request.url);
      const id = url.searchParams.get("id");
  
      if (!id) {
        return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });
      }
  
      const supabase = getSupabaseServerClient();
      const { error } = await supabase
        .from("bidding_watchers")
        .delete()
        .eq("id", id);
  
      if (error) throw error;
  
      return NextResponse.json({ ok: true });
    } catch (err: any) {
      return NextResponse.json(
        { ok: false, error: err?.message ?? "Unknown error" },
        { status: 500 }
      );
    }
  }
