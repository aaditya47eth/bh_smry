import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServerClient";
import { requireAuth } from "@/lib/serverAuth";

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request, ["admin", "manager"]);
    if (!auth.ok) return auth.response;

    const supabase = getSupabaseServerClient();
    
    // Fetch all bids for posts that the user is watching
    // First get all watched posts (removed created_by filter to show all system activity)
    const { data: watchers, error: watcherError } = await supabase
        .from('bidding_watchers')
        .select('post_url, my_name');
    
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
    const winningBids: any[] = [];
    
    // Process bids to find outbid events
    // Group bids by post
    const bidsByPost = new Map();
    bids?.forEach((bid: any) => {
        if (!bidsByPost.has(bid.post_url)) {
            bidsByPost.set(bid.post_url, []);
        }
        bidsByPost.get(bid.post_url).push(bid);
    });
    
    const myNames = [auth.user.username, auth.user.name, "Ken Kaneki"].filter(Boolean).map(n => n?.toLowerCase().trim());

    bidsByPost.forEach((postBids, postUrl) => {
        const itemsMap = new Map(); // item_number -> { currentHighBid, currentHighBidder, myHighestBid }

        const watcher = watchers.find((w: any) => w.post_url === postUrl);
        const postLabel = watcher?.my_name || postUrl;

        postBids.forEach((bid: any) => {
            const itemNo = bid.item_number || 0;
            if (!itemsMap.has(itemNo)) {
                itemsMap.set(itemNo, { 
                    currentHighBid: 0, 
                    currentHighBidder: "", 
                    myHighestBid: 0,
                    lastBidTime: null
                });
            }
            
            const itemState = itemsMap.get(itemNo);
            const amount = Number(bid.amount);
            const bidder = (bid.bidder_name || "Unknown").trim();
            const bidderLower = bidder.toLowerCase();
            const isMe = myNames.some(n => bidderLower.includes(n));

            // Update high bid for this item
            if (amount > itemState.currentHighBid) {
                itemState.currentHighBid = amount;
                itemState.currentHighBidder = bidder;
                itemState.lastBidTime = bid.timestamp;
            }
            
            // Track my highest bid for this item
            if (isMe) {
                if (amount > itemState.myHighestBid) itemState.myHighestBid = amount;
                
                activities.push({
                    type: 'bid_placed',
                    post_url: postUrl,
                    post_label: postLabel,
                    item_number: itemNo,
                    my_bid: amount,
                    timestamp: bid.timestamp
                });
            }
        });

        // Now check status for each item
        itemsMap.forEach((state, itemNo) => {
             if (state.myHighestBid > 0) {
                 const isWinnerMe = myNames.some(n => state.currentHighBidder.toLowerCase().includes(n));
                 
                 if (isWinnerMe) {
                     winningBids.push({
                         post_url: postUrl,
                         post_label: postLabel,
                         item_number: itemNo,
                         my_bid: state.currentHighBid,
                         timestamp: state.lastBidTime
                     });
                 } else if (state.currentHighBid > state.myHighestBid) {
                     activities.push({
                         type: 'outbidded',
                         post_url: postUrl,
                         post_label: postLabel,
                         item_number: itemNo,
                         my_bid: state.myHighestBid,
                         winning_bid: state.currentHighBid,
                         winner: state.currentHighBidder,
                         timestamp: new Date().toISOString() // This is a status check, so timestamp is "now" effectively
                     });
                 }
             }
        });
    });

    // Sort activities by timestamp desc
    activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    winningBids.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return NextResponse.json({ ok: true, activities, winningBids });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
