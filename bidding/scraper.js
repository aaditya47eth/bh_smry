require('dotenv').config();
const puppeteer = require('puppeteer-core');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Config
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const CHROME_EXEC_PATH = process.env.CHROME_EXEC_PATH;
const HEADLESS = process.env.HEADLESS !== 'false';
const INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

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
}

async function scrapePost(watcher) {
    console.log(`Scraping: ${watcher.post_url}`);
    try {
        await page.goto(watcher.post_url, { waitUntil: 'networkidle2', timeout: 60000 });
        
        // Basic scraping logic (expand comments, extract text)
        // This is a simplified version. You might need to adjust selectors based on FB updates.
        
        // 1. Try to click "All comments" or "View more comments"
        // (Implementation omitted for brevity, but would go here)

        // 2. Extract comments
        const comments = await page.evaluate(() => {
            const nodes = document.querySelectorAll('div[role="article"]'); // Generic comment selector
            const results = [];
            nodes.forEach(node => {
                const userEl = node.querySelector('span[dir="auto"]'); // Often the username
                const textEl = node.querySelector('div[dir="auto"]');
                const user = userEl ? userEl.innerText : "Unknown";
                const text = textEl ? textEl.innerText : "";
                
                // Simple heuristic to find bids (e.g., numbers)
                const priceMatch = text.match(/(\d+)/);
                const price = priceMatch ? parseInt(priceMatch[1], 10) : null;

                // Filter out low numbers (likely not bids) to satisfy DB constraint (amount >= 10)
                if (price && price >= 10) {
                    results.push({
                        user_name: user,
                        bid_text: text,
                        price: price,
                        timestamp: new Date().toISOString() // Approximate
                    });
                }
            });
            return results;
        });

        console.log(`Found ${comments.length} potential bids.`);

        // 3. Save to Supabase
        for (const bid of comments) {
            // Check if exists to avoid duplicates (simplified)
            // Ideally we'd have a unique ID from FB, but for now we use user+price+post
            const { error } = await supabase
                .from('bidding_bids')
                .insert({
                    post_url: watcher.post_url,
                    item_number: 1, // Defaulting to 1 as scraper doesn't extract it yet
                    amount: bid.price,
                    bidder_name: bid.user_name,
                    raw_comment: bid.bid_text,
                    timestamp: bid.timestamp
                });
            if (error) console.error("Error saving bid:", error.message);
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
        console.log("Loading cookies from Supabase...");
        // Fix: Puppeteer setCookie requires sameSite to be a string or undefined, not boolean/null if malformed
        const fixedCookies = cookies.map(c => {
            const copy = { ...c };
            // Ensure sameSite is valid or remove it
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
    const watchers = await getActiveWatchers();
    if (watchers.length === 0) {
        console.log("No active watchers.");
    }

    for (const watcher of watchers) {
        await scrapePost(watcher);
        // Wait a bit between posts
        await new Promise(r => setTimeout(r, 5000));
    }

    console.log(`Done. Waiting ${INTERVAL_MS / 1000}s...`);
}

// Main Loop
(async () => {
    while (true) {
        await run();
        await new Promise(r => setTimeout(r, INTERVAL_MS));
    }
})();
