import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServerClient";
import { requireAuth } from "@/lib/serverAuth";

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request, ["admin", "manager"]);
    if (!auth.ok) return auth.response;

    const supabase = getSupabaseServerClient();
    
    // Fetch all bids for posts that the user is watching
    // First get the user's watched posts
    const { data: watchers, error: watcherError } = await supabase
        .from('bidding_watchers')
        .select('post_url, my_name')
        .eq('created_by', auth.user.username);
    
    if (watcherError) throw watcherError;
    
    if (!watchers || watchers.length === 0) {
        return NextResponse.json({ ok: true, activities: [] });
    }

    const postUrls = watchers.map((w: any) => w.post_url);
    
    // Fetch all bids for these posts
    const { data: bids, error: bidsError } = await supabase
        .from('bidding_bids')
        .select('*')
        .in('post_url', postUrls)
        .order('timestamp', { ascending: true }); // Order by time to replay history
    
    if (bidsError) throw bidsError;

    const activities: any[] = [];
    
    // Process bids to find outbid events
    // Group bids by post
    const bidsByPost = new Map();
    bids?.forEach((bid: any) => {
        if (!bidsByPost.has(bid.post_url)) {
            bidsByPost.set(bid.post_url, []);
        }
        bidsByPost.get(bid.post_url).push(bid);
    });

    // For each post, track the current highest bid and if it's me
    // Since we don't have a strict "my user id" in bids table (it uses Facebook names),
    // we have to guess or assume the user knows their FB name.
    // However, the user said "if i got outbidded".
    // We can look for bids where bidder_name matches `my_name` from watcher?
    // But `my_name` is usually set to "My Name - Post No".
    // Let's assume the user's name in `bidding_watchers` (the `my_name` field) MIGHT be their FB name,
    // OR we just list all high bid changes and let the user see.
    // BUT the prompt specifically said "if i got outbidded".
    // Let's try to match `auth.user.name` or `auth.user.username` against `bidder_name`.
    // Or maybe we can just show "New highest bid by X" and highlight if it's NOT me.
    
    // Let's assume the user's configured name in the watcher is their "display name" for the auction?
    // Actually, `my_name` in `bidding_watchers` is just a label for the watcher.
    
    // Let's look for bids that match the user's `auth.user.name` (if set) or `auth.user.username`.
    // This is imperfect but the best we can do without a mapping.
    
    const myNames = [auth.user.username, auth.user.name].filter(Boolean).map(n => n?.toLowerCase());

    bidsByPost.forEach((postBids, postUrl) => {
        let currentHighBid = 0;
        let currentHighBidder = "";
        let myHighestBid = 0;
        
        // Find the watcher for this post to get the label
        const watcher = watchers.find((w: any) => w.post_url === postUrl);
        const postLabel = watcher?.my_name || postUrl;

        postBids.forEach((bid: any) => {
            const amount = Number(bid.amount);
            const bidder = bid.bidder_name || "Unknown";
            const isMe = myNames.some(n => bidder.toLowerCase().includes(n));

            if (isMe) {
                // Found a bid by me
                activities.push({
                    type: 'bid_placed',
                    post_url: postUrl,
                    post_label: postLabel,
                    my_bid: amount,
                    timestamp: bid.timestamp
                });
            }

            if (amount > currentHighBid) {
                // New high bid
                // ... (rest of logic)
                currentHighBid = amount;
                currentHighBidder = bidder;
            }
            
            if (isMe) {
                if (amount > myHighestBid) myHighestBid = amount;
            }
        });

        // After processing all bids, if I participated (myHighestBid > 0) AND I am not the winner
        if (myHighestBid > 0) {
             const isWinnerMe = myNames.some(n => currentHighBidder.toLowerCase().includes(n));
             if (!isWinnerMe && currentHighBid > myHighestBid) {
                 activities.push({
                     type: 'outbidded',
                     post_url: postUrl,
                     post_label: postLabel,
                     my_bid: myHighestBid,
                     winning_bid: currentHighBid,
                     winner: currentHighBidder,
                     timestamp: new Date().toISOString() // We don't have exact time of outbid easily without replaying, just show current state
                 });
             }
        }
    });

    // Sort activities by timestamp desc
    activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return NextResponse.json({ ok: true, activities });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
