require('dotenv').config();
const puppeteer = require('puppeteer-core');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Config
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const CHROME_EXEC_PATH = process.env.CHROME_EXEC_PATH;
const HEADLESS = process.env.HEADLESS !== 'false';
const INTERVAL_MS = 10000; // Check loop every 10 seconds

if (!SUPABASE_URL || !SUPABASE_KEY || !CHROME_EXEC_PATH) {
    console.error("Missing configuration. Please check .env file.");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
let browser = null;
let page = null;

async function getCookies() {
    const { data, error } = await supabase
        .from('bidding_cookies')
        .select('cookies_json')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    
    if (error) {
        console.error("Error fetching cookies:", error);
        return null;
    }
    return data?.cookies_json;
}

async function getActiveWatchers() {
    const { data, error } = await supabase
        .from('bidding_watchers')
        .select('*')
        .eq('is_running', true);
    
    if (error) {
        console.error("Error fetching watchers:", error);
        return [];
    }
    return data || [];
}

async function initBrowser() {
    if (browser) return;
    console.log("Launching browser...");
    browser = await puppeteer.launch({
        executablePath: CHROME_EXEC_PATH,
        headless: HEADLESS,
        defaultViewport: null,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized']
    });
    const pages = await browser.pages();
    page = pages.length > 0 ? pages[0] : await browser.newPage();
    
    // Listen for browser console logs
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
}

async function scrapePostBids(watcher, isFirstScrape) {
    console.log(`💰 Scraping Bids: ${watcher.post_url} (First time: ${isFirstScrape})`);
    try {
        await page.goto(watcher.post_url, { waitUntil: 'networkidle2', timeout: 60000 });
        
        // Scroll to load comments
        console.log("   Expanding comments...");
        await page.evaluate(async (isFirst) => {
            // Helper to find all scrollable containers
            const findScrollables = () => {
                const all = document.querySelectorAll('*');
                const scrollables = [];
                for (const el of all) {
                    const style = window.getComputedStyle(el);
                    if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > el.clientHeight) {
                        scrollables.push(el);
                    }
                }
                return scrollables;
            };

            // Scroll loop
            // First time: 5 iterations. Subsequent times: 2 iterations.
            const iterations = isFirst ? 5 : 2;
            
            for (let i = 0; i < iterations; i++) {
                // Scroll slowly to bottom
                // Instead of one big jump, do small jumps
                const totalHeight = document.body.scrollHeight;
                const scrollStep = 300;
                let currentScroll = window.scrollY;
                
                // Scroll down in chunks
                for (let j = 0; j < 10; j++) {
                    window.scrollBy(0, scrollStep);
                    await new Promise(r => setTimeout(r, 200)); // Wait 200ms between small scrolls
                }
                
                // Final jump to ensure bottom
                window.scrollTo(0, document.body.scrollHeight);
                
                // Scroll all scrollable containers
                const scrollables = findScrollables();
                scrollables.forEach(el => {
                    el.scrollTop = el.scrollHeight;
                });
                
                await new Promise(r => setTimeout(r, 2000)); // Wait 2s for loading

                // Try to click "View more comments"
                // Look for buttons, spans, divs with specific text
                const candidates = Array.from(document.querySelectorAll('div[role="button"], span[role="button"], a[role="button"], span, div'));
                const viewMore = candidates.find(b => {
                    const text = b.innerText.toLowerCase().trim();
                    if (!text) return false;
                    // Check text content
                    const isViewMore = text.includes('view more comments') || 
                                       text.includes('view previous comments') ||
                                       text.includes('view 1 more comment') ||
                                       text.includes('most relevant') ||
                                       text.includes('all comments');
                    
                    if (!isViewMore) return false;

                    // Avoid clicking the main post text or big containers
                    // Buttons are usually small
                    const rect = b.getBoundingClientRect();
                    if (rect.height > 100 || rect.width > 500) return false;

                    return true;
                });
                
                if (viewMore) {
                    console.log('   Clicking:', viewMore.innerText.substring(0, 30));
                    viewMore.click();
                    await new Promise(r => setTimeout(r, 3000));
                }

                // NEW: Click "See more" ONLY for seller comments
                // We assume the seller is the one posting the list
                const articles = Array.from(document.querySelectorAll('div[role="article"]'));
                
                for (const article of articles) {
                    // Quick check for seller name in the article text
                    // This is faster than full parsing
                    const textLower = article.innerText.toLowerCase();
                    if (textLower.includes('pranakorntoy') || textLower.includes('ry pnktoy')) {
                         // Find "See more" inside this article
                         const seeMoreBtn = Array.from(article.querySelectorAll('div[role="button"], span[role="button"], a[role="button"]'))
                            .find(el => {
                                const t = el.innerText.trim().toLowerCase();
                                return t === 'see more' || t === '… see more';
                            });
                         
                         if (seeMoreBtn) {
                             console.log('   Expanding Seller Comment...');
                             seeMoreBtn.click();
                             await new Promise(r => setTimeout(r, 1000)); // Wait for text to expand
                             // User said "scan the only first see more of the seller"
                             // So we break after finding and clicking one, to avoid clicking old ones or duplicates
                             break; 
                         }
                    }
                }
            }
        }, isFirstScrape); // Pass isFirstScrape to page context

        // Extract comments
        const comments = await page.evaluate(() => {
            const nodes = document.querySelectorAll('div[role="article"]'); // Generic comment selector
            const results = [];
            
            nodes.forEach(node => {
                let user = "";
                
                // Strategy 0: Check aria-label
                const label = node.getAttribute('aria-label');
                if (label && label.includes('Comment by')) {
                    user = label.replace('Comment by', '').trim();
                }

                // Strategy 0.5: Specific structure based on user feedback + User ID link
                // <a role="link" href=".../user/...">...<span dir="auto">Name</span>...</a>
                if (!user) {
                    const userLink = Array.from(node.querySelectorAll('a[role="link"]')).find(a => a.href.includes('/user/'));
                    if (userLink) {
                        // Try to find the name span inside
                        const nameSpan = userLink.querySelector('span[dir="auto"]');
                        if (nameSpan) user = nameSpan.innerText.trim();
                        else user = userLink.innerText.trim();
                    }
                }

                // Strategy 1: Look for any author link (most reliable generic)
                if (!user) {
                    const links = Array.from(node.querySelectorAll('a'));
                    const profileLink = links.find(a => {
                        const href = a.href || "";
                        const text = a.innerText.trim();
                        if (!text) return false;
                        if (href.includes('/hashtag/')) return false;
                        if (href.includes('comment_id=')) return false; 
                        if (text === 'Top Fan' || text === 'Author' || text === 'Follow') return false;
                        // Names are usually bold
                        const style = window.getComputedStyle(a);
                        if (style.fontWeight === '600' || style.fontWeight === '700' || style.fontWeight === 'bold') return true;
                        
                        return href.length > 10 && !href.includes('facebook.com/l.php'); // Internal links
                    });

                    if (profileLink) {
                        user = profileLink.innerText.trim();
                    }
                }

                // Strategy 2: Look for span[dir="auto"] that is likely the name (Bold text)
                if (!user) {
                    const spans = Array.from(node.querySelectorAll('span[dir="auto"]'));
                    const boldSpan = spans.find(s => {
                        const style = window.getComputedStyle(s);
                        return (style.fontWeight === '600' || style.fontWeight === '700' || style.fontWeight === 'bold');
                    });
                    if (boldSpan) user = boldSpan.innerText.trim();
                }
                
                // Strategy 3: Fallback to any element with class containing 'user' or 'author'
                if (!user) {
                     const userEl = node.querySelector('.xt0psk2'); 
                     if (userEl) user = userEl.innerText.trim();
                }

                const textEl = node.querySelector('div[dir="auto"]');
                const text = textEl ? textEl.innerText : "";
                
                if (!text) return;
                
                // Strategy 4: Text Heuristic (Last Resort)
                // If we still don't have a user, try to parse from the node's full text
                // Usually: "Name\nComment..."
                if (!user) {
                    const fullText = node.innerText || "";
                    const lines = fullText.split('\n').map(l => l.trim()).filter(Boolean);
                    if (lines.length > 0) {
                        const candidate = lines[0];
                        // Basic validation: not a number, not "Like", not too long
                        if (candidate.length < 50 && isNaN(parseInt(candidate)) && candidate !== 'Like' && candidate !== 'Reply') {
                            user = candidate;
                        }
                    }
                }

                // Debug: If user is still missing but we have text, log it
                if (!user) {
                    // Try to find any strong/bold tag
                    const strong = node.querySelector('strong, span[style*="bold"]');
                    if (strong) user = strong.innerText.trim();
                    
                    if (!user) {
                        user = "Unknown_Debug"; 
                        console.log('FAILED_USER_PARSE:', node.outerHTML.substring(0, 200));
                    }
                }
                
                user = user.trim();

                // Parse Bids: "Item.Price" or "Item Price"
                // Regex: Start or space, (1-2 digits), dot or space, (digits), end or space
                // e.g. "25.50", "25 50", "3.50", "15.120"
                // Use global match to find ALL bids in the text (e.g. list)
                // Improved Regex: Allow spaces around separator: 1. 100
                const bidRegex = /(?:^|\s|\n)(\d{1,2})\s*[\.\s]\s*(\d+(?:\.\d+)?)(?:-|\s|$|\n)/g;
                let match;
                while ((match = bidRegex.exec(text)) !== null) {
                    const itemNo = parseInt(match[1], 10);
                    const price = parseFloat(match[2]);
                    
                    if (itemNo > 0 && price >= 10) {
                        // Filter out seller if they are the "bidder"
                        if (!user.toLowerCase().includes('pranakorntoy') && !user.toLowerCase().includes('ry pnktoy')) {
                            results.push({
                                user_name: user,
                                bid_text: text,
                                item_number: itemNo,
                                price: price,
                                timestamp: new Date().toISOString() // Approximate
                            });
                        }
                    }
                }

                // Parse Summary: "Item.Price-Winner"
                // e.g. "1.700-Tay Piyawat"
                const summaryRegex = /(?:^|\s|\n)(\d{1,2})[\.](\d+(?:\.\d+)?)-(.*)(?:$|\n)/g;
                let summaryMatch;
                while ((summaryMatch = summaryRegex.exec(text)) !== null) {
                     const itemNo = parseInt(summaryMatch[1], 10);
                     const price = parseFloat(summaryMatch[2]);
                     const winner = summaryMatch[3].trim();
                     
                     if (itemNo > 0 && price >= 10) {
                        results.push({
                            user_name: winner, // The winner is the bidder
                            bid_text: text, // Context
                            item_number: itemNo,
                            price: price,
                            timestamp: new Date().toISOString(),
                            is_summary: true
                        });
                     }
                }
            });

            // Find the most recent activity (minimum age)
            let minAgeMinutes = 999999;
            const timeRegex = /(\d+)\s*(m|min|mins|h|hr|hrs|d|day|days)/i;
            
            // Helper to parse FB time string to minutes
            const parseFbTime = (str) => {
                if (!str) return 999999;
                str = str.trim().toLowerCase();
                if (str === 'just now') return 0;
                if (str.includes('yesterday')) return 24 * 60; // > 10 mins
                
                const match = str.match(timeRegex);
                if (match) {
                    let val = parseInt(match[1], 10);
                    const unit = match[2];
                    if (unit.startsWith('h')) val *= 60;
                    if (unit.startsWith('d')) val *= 60 * 24;
                    return val;
                }
                return 999999;
            };

            // Scan all text nodes in the comments section for time-like strings
            // This is a heuristic because finding the exact timestamp node is hard
            const allLinks = Array.from(document.querySelectorAll('a, span, div'));
            for (const el of allLinks) {
                const t = el.innerText;
                if (t && (t.match(/^\d+\s*[mhdy]$/) || t.match(/^\d+\s*(min|hr|day)s?$/) || t.toLowerCase() === 'just now')) {
                    const age = parseFbTime(t);
                    if (age < minAgeMinutes) minAgeMinutes = age;
                }
            }
            
            return { bids: results, minAgeMinutes };
        });

        console.log(`   Found ${comments.bids.length} potential bids.`);
        console.log(`   Most recent activity: ${comments.minAgeMinutes === 999999 ? 'Unknown' : comments.minAgeMinutes + ' mins ago'}`);

        // Save to Supabase
        for (const bid of comments.bids) {
            // Clean up name if it contains time info (heuristic)
            // e.g. "Name 5m" or "Name 5 minutes ago"
            bid.user_name = bid.user_name.replace(/\s+\d+\s*(?:m|h|min|mins|hr|hrs|minute|minutes|hour|hours|d|day|days)(?:\s+ago)?$/i, '');
            bid.user_name = bid.user_name.replace(/\s+(?:Just now|Yesterday|\d+h|\d+m)$/i, '');
            bid.user_name = bid.user_name.trim();

            // Try to insert
            const { error } = await supabase
                .from('bidding_bids')
                .insert({
                    post_url: watcher.post_url,
                    item_number: bid.item_number, 
                    amount: bid.price,
                    bidder_name: bid.user_name,
                    raw_comment: bid.bid_text,
                    timestamp: bid.timestamp
                });
            
            // Regardless of insert success/failure, if we have a valid name, 
            // DELETE any "Unknown" entry for this specific item/price.
            // This fixes the issue where "Unknown" persists because it was inserted earlier.
            if (bid.user_name && bid.user_name !== 'Unknown' && bid.user_name !== 'Unknown_Debug') {
                 await supabase
                    .from('bidding_bids')
                    .delete()
                    .eq('post_url', watcher.post_url)
                    .eq('item_number', bid.item_number)
                    .eq('amount', bid.price)
                    .or('bidder_name.eq.Unknown,bidder_name.eq.Unknown_Debug,bidder_name.eq.,bidder_name.is.null');
            }

            if (error) {
                // Ignore duplicate errors
                if (error.code !== '23505') {
                    console.error("   Error saving bid:", error.message);
                }
            } else {
                // Log to file only on successful insert (new bid)
                try {
                    const logEntry = `${new Date().toISOString()} | Post: ${watcher.my_name} | Item: ${bid.item_number} | Price: ${bid.price} | Bidder: ${bid.user_name}\n`;
                    fs.appendFileSync('bid_logs.txt', logEntry);
                } catch (err) {
                    console.error("   Error writing to log file:", err.message);
                }
            }
        }
        
        // Update watcher timestamp
        await supabase
            .from('bidding_watchers')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', watcher.id);

        // Check for inactivity (10 mins)
        if (comments.minAgeMinutes > 10 && comments.minAgeMinutes !== 999999) {
            console.log(`   ⚠️ No new comments for ${comments.minAgeMinutes} mins. Marking as ENDED.`);
            await supabase
                .from('bidding_watchers')
                .update({ is_running: false })
                .eq('id', watcher.id);
        }

    } catch (e) {
        console.error(`Error scraping ${watcher.post_url}:`, e.message);
    }
}

async function run() {
    await initBrowser();

    // 1. Load Cookies
    const cookies = await getCookies();
    if (cookies && Array.isArray(cookies)) {
        const fixedCookies = cookies.map(c => {
            const copy = { ...c };
            if (copy.sameSite === 'no_restriction' || copy.sameSite === 'unspecified') {
                copy.sameSite = 'None';
            } else if (copy.sameSite === 'lax') {
                copy.sameSite = 'Lax';
            } else if (copy.sameSite === 'strict') {
                copy.sameSite = 'Strict';
            } else {
                delete copy.sameSite;
            }
            return copy;
        });
        await page.setCookie(...fixedCookies);
    } else {
        console.warn("No cookies found in Supabase! Please add them in Admin Panel.");
    }

    // 2. Loop Watchers
    const scrapedWatchers = new Set();

    while (true) {
        console.log("Checking for active watchers...");
        const watchers = await getActiveWatchers();
        
        if (watchers.length === 0) {
            console.log("No active watchers. Sleeping...");
        }

        for (const watcher of watchers) {
            // Check if due for refresh (1 minute = 60000ms)
            const lastUpdate = new Date(watcher.updated_at || 0).getTime();
            const now = Date.now();
            const diff = now - lastUpdate;
            
            if (diff >= 60000) { // 1 minute
                const isFirstScrape = !scrapedWatchers.has(watcher.id);
                await scrapePostBids(watcher, isFirstScrape);
                scrapedWatchers.add(watcher.id);
                
                // Wait a bit between posts
                await new Promise(r => setTimeout(r, 5000));
            } else {
                // console.log(`   Skipping ${watcher.post_url} (updated ${Math.round(diff/1000)}s ago)`);
            }
        }
        
        // Wait before next check loop
        await new Promise(r => setTimeout(r, INTERVAL_MS));
    }
}

// Main Loop
(async () => {
    await run();
})();
