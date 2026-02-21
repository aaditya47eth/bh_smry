import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServerClient";
import { requireAuth } from "@/lib/serverAuth";

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request, ["admin", "manager"]);
    if (!auth.ok) return auth.response;

    const supabase = getSupabaseServerClient();
    // Fetch watchers with images and latest bid
    const { data, error } = await supabase
      .from("bidding_watchers")
      .select(`
        *,
        bidding_posts (
          images,
          bidding_bids (
            amount,
            timestamp
          )
        )
      `)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const watchers = (data || []).map((w: any) => {
      // Find latest bid manually since we can't easily limit nested join to 1 per row in simple query
      const bids = w.bidding_posts?.bidding_bids || [];
      // Sort bids desc by timestamp
      bids.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      const lastBid = bids.length > 0 ? bids[0] : null;

      return {
        ...w,
        images: w.bidding_posts?.images || [],
        last_bid_amount: lastBid?.amount || null,
        last_bid_at: lastBid?.timestamp || null
      };
    });

    return NextResponse.json({ ok: true, watchers });
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
    const { postUrl, intervalSec, images, my_name } = body;

    if (!postUrl) {
      return NextResponse.json({ ok: false, error: "Missing postUrl" }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    
    // Ensure post exists in bidding_posts first (to satisfy FK constraint)
    const { data: postData, error: postError } = await supabase
      .from('bidding_posts')
      .select('post_url')
      .eq('post_url', postUrl)
      .maybeSingle();

    if (!postData) {
      const { error: createPostError } = await supabase
        .from('bidding_posts')
        .insert([{ post_url: postUrl, images: images || [] }]);
      
      if (createPostError) {
        // Ignore unique violation if race condition occurred
        if (createPostError.code !== '23505') {
           throw createPostError;
        }
      }
    } else if (images) {
        // Update images if provided and post exists
        await supabase.from('bidding_posts').update({ images }).eq('post_url', postUrl);
    }
    
    // Check if watcher exists for this user/post
    const { data: existing } = await supabase
        .from('bidding_watchers')
        .select('id')
        .eq('post_url', postUrl)
        .eq('created_by', auth.user.username)
        .maybeSingle();

    let error;
    if (existing) {
        const updates: any = {
            is_running: true, 
            interval_sec: intervalSec || 120,
            my_name: my_name || auth.user.name || auth.user.username 
        };
        const { error: updateError } = await supabase
            .from('bidding_watchers')
            .update(updates)
            .eq('id', existing.id);
        error = updateError;
    } else {
        const { error: insertError } = await supabase
            .from('bidding_watchers')
            .insert([{
                post_url: postUrl,
                my_name: my_name || auth.user.name || auth.user.username,
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
    const { id, is_running, is_bookmarked, post_url, my_name, images } = body;

    if (!id) {
      return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    
    // Handle Post URL / Images updates
    if (post_url) {
        // Ensure new post exists
        const { data: postData } = await supabase
            .from('bidding_posts')
            .select('post_url')
            .eq('post_url', post_url)
            .maybeSingle();
        
        if (!postData) {
            await supabase.from('bidding_posts').insert([{ post_url, images: images || [] }]);
        } else if (images) {
            await supabase.from('bidding_posts').update({ images }).eq('post_url', post_url);
        }
    } else if (images) {
        // Get current post url
        const { data: watcher } = await supabase
            .from('bidding_watchers')
            .select('post_url')
            .eq('id', id)
            .single();
        
        if (watcher?.post_url) {
            await supabase.from('bidding_posts').update({ images }).eq('post_url', watcher.post_url);
        }
    }

    const updates: any = {};
    if (typeof is_running !== 'undefined') updates.is_running = is_running;
    if (typeof is_bookmarked !== 'undefined') updates.is_bookmarked = is_bookmarked;
    if (post_url) updates.post_url = post_url;
    if (my_name) updates.my_name = my_name;

    const { error } = await supabase
      .from("bidding_watchers")
      .update(updates)
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
      const all = url.searchParams.get("all");
  
      const supabase = getSupabaseServerClient();

      if (all === 'true') {
        const { error } = await supabase
            .from("bidding_watchers")
            .delete()
            .neq("id", 0); // Delete all
        if (error) throw error;
      } else {
        if (!id) {
            return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });
        }
        const { error } = await supabase
            .from("bidding_watchers")
            .delete()
            .eq("id", id);
        if (error) throw error;
      }
  
      return NextResponse.json({ ok: true });
    } catch (err: any) {
      return NextResponse.json(
        { ok: false, error: err?.message ?? "Unknown error" },
        { status: 500 }
      );
    }
  }
