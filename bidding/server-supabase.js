/**
 * server-supabase.js
 * Backend for Facebook Auction Tracker with Supabase integration.
 * Handles Puppeteer automation, Supabase storage, and Socket.IO updates.
 * 
 * This version syncs data across all users/devices via Supabase.
 */

require('dotenv').config();
const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const puppeteer = require('puppeteer-core');
const { createClient } = require('@supabase/supabase-js');

// --- CONFIGURATION & SETUP ---

const PORT = process.env.PORT || 3000;
const CHROME_EXEC_PATH = process.env.CHROME_EXEC_PATH;
const CHROME_PROFILE_DIR = process.env.CHROME_PROFILE_DIR;
const HEADLESS = process.env.HEADLESS !== 'false';

// Supabase Config
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://tqbeaihrdtkcroiezame.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxYmVhaWhyZHRrY3JvaWV6YW1lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE3NDk3ODMsImV4cCI6MjA3NzMyNTc4M30.TCpWEAhq08ivt3NbT7Lvw135qcCshkJH1X58y-T2rmw';

// Cloudinary Config
const CLOUDINARY_CLOUD_NAME = 'dt5jgkfwb';
const CLOUDINARY_UPLOAD_PRESET = 'review_strg';

if (!CHROME_EXEC_PATH) {
    console.error("ERROR: CHROME_EXEC_PATH is not set in .env file.");
}

// Initialize Supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// OCR Cache: { url: text }
const ocrCache = new Map();

// Lazy load Tesseract
let Tesseract = null;
async function getTesseract() {
    if (!Tesseract) {
        const tesseractModule = await import('tesseract.js');
        Tesseract = tesseractModule.default;
    }
    return Tesseract;
}

// Fetch latest cookies from Supabase (if available)
async function loadLatestCookiesFromSupabase() {
    try {
        const { data: cookieData, error } = await supabase
            .from('bidding_cookies')
            .select('cookies_json')
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (error) return null;
        if (cookieData && cookieData.cookies_json && Array.isArray(cookieData.cookies_json)) {
            return cookieData.cookies_json;
        }
    } catch (e) {
        console.warn('Failed to load cookies from Supabase:', e.message);
    }
    return null;
}

// --- SUPABASE DATABASE FUNCTIONS ---

async function insertBid(postUrl, item, amount, bidder, rawComment, relativeTime, commentImages = []) {
    try {
        const { data, error } = await supabase
            .from('bidding_bids')
            .insert([{
                post_url: postUrl,
                item_number: item,
                amount: amount,
                bidder_name: bidder,
                raw_comment: rawComment,
                relative_time: relativeTime || "",
                comment_images: commentImages
            }])
            .select();
        
        if (error) {
            // If duplicate, ignore (unique constraint)
            if (error.code === '23505') {
                return false;
            }
            throw error;
        }
        return data && data.length > 0;
    } catch (e) {
        console.error('Error inserting bid:', e);
        return false;
    }
}

async function savePostImages(postUrl, imageUrls) {
    try {
        // Check if post exists
        const { data: existing } = await supabase
            .from('bidding_posts')
            .select('id')
            .eq('post_url', postUrl)
            .single();
        
        if (existing) {
            // Update existing post
            await supabase
                .from('bidding_posts')
                .update({ images: imageUrls })
                .eq('post_url', postUrl);
        } else {
            // Create new post
            await supabase
                .from('bidding_posts')
                .insert([{
                    post_url: postUrl,
                    images: imageUrls
                }]);
        }
    } catch (e) {
        console.error('Error saving post images:', e);
    }
}

async function getPostImages(postUrl) {
    try {
        const { data, error } = await supabase
            .from('bidding_posts')
            .select('images')
            .eq('post_url', postUrl)
            .single();
        
        if (error || !data) return [];
        return data.images || [];
    } catch (e) {
        return [];
    }
}

async function getHighestBids(postUrl) {
    try {
        const { data, error } = await supabase
            .from('bidding_bids')
            .select('*')
            .eq('post_url', postUrl)
            .order('timestamp', { ascending: false });
        
        if (error) throw error;
        return data || [];
    } catch (e) {
        console.error('Error getting bids:', e);
        return [];
    }
}

async function updatePostNumber(postUrl, postNumber) {
    try {
        const { data: existing } = await supabase
            .from('bidding_posts')
            .select('id')
            .eq('post_url', postUrl)
            .single();
        
        if (existing) {
            await supabase
                .from('bidding_posts')
                .update({ post_number: postNumber })
                .eq('post_url', postUrl);
        } else {
            await supabase
                .from('bidding_posts')
                .insert([{
                    post_url: postUrl,
                    post_number: postNumber
                }]);
        }
    } catch (e) {
        console.error('Error updating post number:', e);
    }
}

// --- CLOUDINARY HELPER ---

async function uploadToCloudinary(imageUrl) {
    try {
        const formData = new URLSearchParams();
        formData.append('file', imageUrl);
        formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

        const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
            method: 'POST',
            body: formData
        });
        
        const data = await res.json();
        return data.secure_url;
    } catch (e) {
        console.error("Cloudinary upload failed:", e.message);
        return null;
    }
}

// --- EXPRESS & SOCKET.IO SETUP ---

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Allow all origins in development
        methods: ["GET", "POST"],
        credentials: true
    }
});

// CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*'); // In production, specify your domain
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

// Send current state to new clients
io.on('connection', async (socket) => {
    console.log('Client connected');
    // Broadcast all active watchers
    const { data: watchers } = await supabase
        .from('bidding_watchers')
        .select('post_url')
        .eq('is_running', true);
    
    if (watchers) {
        for (const watcher of watchers) {
            const fbWatcher = watchersMap.get(watcher.post_url);
            if (fbWatcher) {
                fbWatcher.broadcastState('Active');
            }
        }
    }
});

app.use(express.static('public'));
app.use(express.json({ limit: '50mb' }));

// Watchers Map: postUrl -> FacebookWatcher instance
const watchersMap = new Map();

// --- SCRAPING LOGIC (Same as before) ---

const sleep = (ms) => new Promise(r => setTimeout(r, ms + Math.random() * 1000));

function parseBids(text) {
    const lines = text.split(/\r?\n/);
    const bids = [];
    
    const summaryRegex = /^(\d+)\s*[\.,\s]*\s*([0-9,]+)\s*[-–—−]\s*(.+)/i;
    const standardRegexGlobal = /(\d{1,3})\s*[\)\.:\-]?\s*(?:[₹Rsrs.]*\s*)?([0-9,]+)/gi;

    for (const line of lines) {
        const cleanLine = line.trim();
        if (!cleanLine) continue;

        const summaryMatch = cleanLine.match(summaryRegex);
        if (summaryMatch) {
            const item = parseInt(summaryMatch[1], 10);
            const amountRaw = summaryMatch[2].replace(/[,.\s]/g, '');
            const amount = parseInt(amountRaw, 10);
            const bidder = summaryMatch[3].trim();
            
            if (item >= 1 && item <= 50 && amount >= 10) {
                if (bidder && (bidder.toLowerCase().includes('pnk pranakorn') || bidder.toLowerCase().includes('tdmd pranakorntoys'))) {
                    continue;
                }
                bids.push({ item, amount, bidder }); 
                continue; 
            }
        }

        const matches = [...cleanLine.matchAll(standardRegexGlobal)];
        for (const match of matches) {
            const item = parseInt(match[1], 10);
            const amountRaw = match[2].replace(/[,.\s]/g, ''); 
            const amount = parseInt(amountRaw, 10);
            
            if (item >= 1 && item <= 50 && amount >= 10) {
                bids.push({ item, amount, bidder: null }); 
            }
        }
    }
    return bids;
}

class FacebookWatcher {
    constructor(postUrl, intervalSec, myName, createdBy) {
        this.postUrl = postUrl;
        this.intervalMs = Math.max(intervalSec * 1000, 30000);
        this.myName = myName;
        this.createdBy = createdBy;
        this.isRunning = false;
        this.browser = null;
        this.page = null;
        this.postNumber = null;
    }

    async checkLoginStatus() {
        try {
            return await this.page.evaluate(() => {
                const text = document.body.innerText.toLowerCase();
                if (text.includes('log in to facebook') || text.includes('login to facebook')) return false;
                if (document.querySelector('input[name="email"]') || document.querySelector('button[name="login"]')) return false;
                if (document.querySelector('a[href*="login.php"]')) return false;
                return true;
            });
        } catch (e) {
            console.warn(`[${this.postUrl}] Login check failed (assuming logged in):`, e.message);
            return true;
        }
    }

    async start() {
        if (this.isRunning) return;
        this.isRunning = true;
        console.log(`Starting watcher for: ${this.postUrl}`);
        
        // Save to database
        await this.saveWatcherToDB();
        
        try {
            await this.initBrowser();
            this.loop();
        } catch (e) {
            console.error(`[${this.postUrl}] Failed to init:`, e);
            this.stop();
        }
    }

    async saveWatcherToDB() {
        try {
            const { data: existing } = await supabase
                .from('bidding_watchers')
                .select('id')
                .eq('post_url', this.postUrl)
                .eq('created_by', this.createdBy)
                .single();
            
            if (existing) {
                await supabase
                    .from('bidding_watchers')
                    .update({ is_running: true, my_name: this.myName, interval_sec: this.intervalMs / 1000 })
                    .eq('id', existing.id);
            } else {
                await supabase
                    .from('bidding_watchers')
                    .insert([{
                        post_url: this.postUrl,
                        my_name: this.myName,
                        interval_sec: this.intervalMs / 1000,
                        is_running: true,
                        created_by: this.createdBy
                    }]);
            }
        } catch (e) {
            console.error('Error saving watcher to DB:', e);
        }
    }

    async stop() {
        this.isRunning = false;
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
        console.log(`[${this.postUrl}] Watcher stopped.`);
        
        // Update database
        try {
            await supabase
                .from('bidding_watchers')
                .update({ is_running: false })
                .eq('post_url', this.postUrl)
                .eq('created_by', this.createdBy);
        } catch (e) {
            console.error('Error updating watcher in DB:', e);
        }
        
        watchersMap.delete(this.postUrl);
        this.broadcastState('Stopped');
    }

    async initBrowser() {
        if (!CHROME_EXEC_PATH) throw new Error("CHROME_EXEC_PATH not set");

        const launchArgs = [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-infobars',
            '--disable-notifications',
            '--window-size=1280,800'
        ];

        if (CHROME_PROFILE_DIR) {
            launchArgs.push(`--user-data-dir=${CHROME_PROFILE_DIR}`);
        }

        this.browser = await puppeteer.launch({
            executablePath: CHROME_EXEC_PATH,
            headless: HEADLESS,
            args: [
                ...launchArgs,
                '--disable-gpu',
                '--disable-dev-shm-usage'
            ],
            defaultViewport: null
        });

        this.page = await this.browser.newPage();
        await this.page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36');

        // Load cookies from Supabase (or fallback to local file)
        if (!CHROME_PROFILE_DIR) {
            let cookies = await loadLatestCookiesFromSupabase();

            // Fallback to local file if Supabase doesn't have cookies
            if (!cookies && require('fs').existsSync('cookies.json')) {
                cookies = JSON.parse(require('fs').readFileSync('cookies.json', 'utf-8'));
                console.log(`[${this.postUrl}] Loaded cookies from local file`);
            }
            
            if (cookies && Array.isArray(cookies) && cookies.length > 0) {
                await this.page.setCookie(...cookies);
                console.log(`[${this.postUrl}] Cookies applied to page`);
            } else {
                console.warn(`[${this.postUrl}] No cookies found. Facebook may require login.`);
            }
        }
    }

    async loop() {
        let firstRun = true;
        while (this.isRunning) {
            try {
                if (firstRun) {
                    console.log(`[${this.postUrl}] Opening page...`);
                    await this.page.goto(this.postUrl, { waitUntil: 'networkidle2', timeout: 60000 });
                    await sleep(5000);
                    console.log(`[${this.postUrl}] Initial Scraping...`);
                    await this.scrape(true, true);
                    firstRun = false;
                } else {
                    console.log(`[${this.postUrl}] Reloading & Scraping...`);
                    await this.page.reload({ waitUntil: 'networkidle2' });
                    await sleep(2000);
                    await this.scrape(false, false);
                }
                
                this.broadcastState('Active');
                
                const jitter = (Math.random() * 0.4 - 0.2) * this.intervalMs;
                await sleep(this.intervalMs + jitter);
            } catch (err) {
                console.error(`[${this.postUrl}] Error:`, err.message);
                await sleep(10000);
            }
        }
    }

    async runOcr(imageUrl) {
        if (ocrCache.has(imageUrl)) return ocrCache.get(imageUrl);
        if (imageUrl.startsWith('data:') || imageUrl.includes('.svg')) return "";

        try {
            const ts = await getTesseract();
            console.log(`[OCR] Scanning: ${imageUrl.substring(0, 50)}...`);
            
            const { data: { text } } = await ts.recognize(imageUrl);
            
            const cleanText = text
                .replace(/\n/g, ' \n ')
                .replace(/[|lI]/g, '1')
                .replace(/[O]/g, '0');

            console.log(`[OCR] Result: ${cleanText.substring(0, 50)}...`);
            
            ocrCache.set(imageUrl, cleanText);
            return cleanText;
        } catch (e) {
            console.error(`[OCR] Failed for ${imageUrl}:`, e.message);
            return "";
        }
    }

    async scrape(skipNav, isFirstRun = false) {
        if (!this.page) return;

        try {
            if (!skipNav) {
                // Already navigated
            }
        } catch (e) {
            console.warn(`[${this.postUrl}] Navigation error:`, e.message);
            return;
        }

        // Check login status before scraping
        const loggedIn = await this.checkLoginStatus();
        if (!loggedIn) {
            console.warn(`[${this.postUrl}] Login required. Please refresh Facebook cookies in Admin Panel.`);
            // Try to refresh cookies from Supabase and retry once
            const refreshedCookies = await loadLatestCookiesFromSupabase();
            if (refreshedCookies && Array.isArray(refreshedCookies) && refreshedCookies.length > 0) {
                try {
                    await this.page.setCookie(...refreshedCookies);
                    console.log(`[${this.postUrl}] Refreshed cookies applied, reloading page...`);
                    await this.page.reload({ waitUntil: 'networkidle2' });
                    await sleep(3000);
                    const relogged = await this.checkLoginStatus();
                    if (!relogged) {
                        this.broadcastState('Login required - update cookies');
                        await sleep(15000);
                        return;
                    }
                } catch (e) {
                    console.warn(`[${this.postUrl}] Failed to apply refreshed cookies: ${e.message}`);
                    this.broadcastState('Login required - update cookies');
                    await sleep(15000);
                    return;
                }
            } else {
                this.broadcastState('Login required - update cookies');
                await sleep(15000);
                return;
            }
        }

        // Scrape Post Number
        if (!this.postNumber) {
            try {
                this.postNumber = await this.page.evaluate(() => {
                    const text = document.body.innerText;
                    const match = text.match(/Post_No\.([\w\.-]+)/i);
                    return match ? match[1] : null;
                });
                if (this.postNumber) {
                    console.log(`[${this.postUrl}] Found Post Number: ${this.postNumber}`);
                    await updatePostNumber(this.postUrl, this.postNumber);
                }
            } catch (e) {
                console.log(`[${this.postUrl}] Post Number scrape failed:`, e.message);
            }
        }

        // Scrape Images (always fetch to get latest images)
        await this.scrapeImages();

        // Switch to "All Comments" mode
        try {
            await this.page.evaluate(async () => {
                const getByText = (text) => {
                    const xpath = `//span[normalize-space()="${text}"] | //div[role="menuitem"]//span[contains(., "${text}")]`;
                    const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
                    return result.singleNodeValue;
                };

                const triggerXpath = `//span[contains(text(), "Most relevant")] | //span[contains(text(), "Top comments")]`;
                const triggerResult = document.evaluate(triggerXpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
                const filterButton = triggerResult.singleNodeValue;

                if (filterButton) {
                    filterButton.click();
                    await new Promise(r => setTimeout(r, 1500));
                    
                    const allCommentsOption = getByText("All comments");
                    if (allCommentsOption) {
                        allCommentsOption.click();
                        await new Promise(r => setTimeout(r, 3000));
                    }
                }
            });
        } catch (e) {
            console.log(`[${this.postUrl}] Filter switch error (ignoring):`, e.message);
        }

        // Expand Comments
        try {
            // Scroll multiple times to trigger lazy loading of comments
            for (let i = 0; i < 3; i++) {
                await this.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
                await sleep(2000);
            }

            const maxExpands = isFirstRun ? 25 : 5;
            
            for (let i = 0; i < maxExpands; i++) {
                const result = await this.page.evaluate(async () => {
                    const getByText = (text) => {
                        const xpath = `//div[@role="button"][contains(., "${text}")] | //span[contains(., "${text}")] | //a[contains(., "${text}")]`;
                        const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
                        return result.singleNodeValue;
                    };

                    const prevComments = getByText("View previous comments") || getByText("View more comments") || getByText("View 1 more comment");
                    
                    if (prevComments && prevComments.offsetParent !== null) {
                        prevComments.click();
                        return 'pagination';
                    }

                    const seeMore = getByText("See more");
                    if (seeMore && seeMore.offsetParent !== null) {
                        seeMore.click();
                        return 'inline';
                    }

                    return false;
                });

                if (result) {
                    await new Promise(r => setTimeout(r, result === 'pagination' ? 3000 : 500));
                } else {
                    break;
                }
            }
        } catch (e) {
            console.log(`[${this.postUrl}] Expand error:`, e.message);
        }

        // Extract Comments
        let comments = [];
        try {
            comments = await this.page.evaluate(() => {
                const results = [];
                const commentNodes = document.querySelectorAll('[role="article"], [aria-label^="Comment"]');
                
                commentNodes.forEach(node => {
                    const fullText = node.innerText || "";
                    const lines = fullText.split('\n').filter(l => l.trim().length > 0);
                    
                    if (lines.length >= 2) {
                        let author = "Unknown";
                        const ariaLabel = node.getAttribute('aria-label');
                        if (ariaLabel && ariaLabel.startsWith("Comment by")) {
                            author = ariaLabel.replace("Comment by ", "");
                        } else {
                            author = lines[0];
                        }
                        
                        const content = lines.slice(1).join('\n');
                        
                        const images = [];
                        const imgNodes = node.querySelectorAll('a[href*="photo.php"], a[href*="/photos/"], div[role="button"] img');
                        imgNodes.forEach(img => {
                            const src = img.src || img.querySelector('img')?.src;
                            if (src) images.push(src);
                        });

                        let timestampStr = new Date().toISOString();
                        const timeLink = node.querySelector('a[href*="comment_id="], a[href*="reply_comment_id="], span > a[role="link"]');
                        if (timeLink) {
                            const t = timeLink.innerText;
                            if (t && (t.match(/\\d+[mhdy]/) || t.includes('Just now') || t.includes('Yesterday'))) {
                                timestampStr = t;
                            }
                        }

                        results.push({ author, content, timestampStr, images });
                    }
                });
                return results;
            });
        } catch (e) {
            if (e && e.message && e.message.includes('detached frame')) {
                console.warn(`[${this.postUrl}] Frame detached during comment extraction, reloading...`);
                await this.page.reload({ waitUntil: 'networkidle2' });
                await sleep(3000);
                return;
            } else {
                throw e;
            }
        }

        // Process Bids
        let newBidsCount = 0;
        for (const c of comments) {
            let contentToParse = c.content;

            if (c.images.length > 0) {
                for (const imgUrl of c.images) {
                    const ocrText = await this.runOcr(imgUrl);
                    if (ocrText) {
                        contentToParse += "\n" + ocrText;
                    }
                }
            }

            const bids = parseBids(contentToParse);
            
            for (const bid of bids) {
                try {
                    const finalBidder = bid.bidder || c.author;
                    const added = await insertBid(this.postUrl, bid.item, bid.amount, finalBidder, c.content, c.timestampStr, c.images);
                    if (added) newBidsCount++;
                } catch (e) {
                    // Ignore
                }
            }
        }
        console.log(`[${this.postUrl}] ${comments.length} comments scanned. ${newBidsCount} new bids saved.`);
    }

    async scrapeImages() {
        console.log(`[${this.postUrl}] Scraping post images (excluding comments)...`);
        try {
            const imageUrls = await this.page.evaluate(() => {
                // Find the main post container - usually the first article or a specific post container
                // Exclude comment sections by targeting only the main post area
                const mainPost = document.querySelector('div[role="article"]:first-of-type') || 
                                document.querySelector('[data-pagelet="MainFeed"] div[role="article"]:first-of-type') ||
                                document.querySelector('div[data-ad-preview="message"]')?.closest('div[role="article"]') ||
                                null;
                
                if (!mainPost) {
                    console.warn('Main post container not found');
                    return [];
                }
                
                // Find comment section to exclude it
                const commentSection = mainPost.querySelector('[role="article"] ~ *') || 
                                      mainPost.querySelector('[aria-label*="comment" i]')?.closest('div') ||
                                      null;
                
                // Get all images from main post only
                const allImgs = Array.from(mainPost.querySelectorAll('img'));
                
                // Filter to only include images that are:
                // 1. Large enough (likely post images, not icons)
                // 2. Not in comment sections
                // 3. Not profile pictures or small icons
                const candidates = allImgs.filter(img => {
                    // Skip if image is in a comment section
                    if (commentSection && commentSection.contains(img)) {
                        return false;
                    }
                    
                    // Skip if parent is clearly a comment (has comment-like structure)
                    const parent = img.closest('div[role="article"], div[data-commentid], div[aria-label*="comment" i]');
                    if (parent && parent !== mainPost) {
                        return false;
                    }
                    
                    const rect = img.getBoundingClientRect();
                    const width = img.naturalWidth || rect.width;
                    const height = img.naturalHeight || rect.height;
                    
                    // Only large images (post images are usually > 200px)
                    if (width < 200 || height < 200) {
                        return false;
                    }
                    
                    // Skip profile pictures and small icons
                    if (width < 300 && height < 300 && (img.src.includes('profile') || img.src.includes('avatar'))) {
                        return false;
                    }
                    
                    return true;
                });

                const urls = candidates.map(img => img.src)
                    .filter(src => src.startsWith('http') && 
                                  !src.includes('profile') && 
                                  !src.includes('avatar') &&
                                  !src.includes('static.xx.fbcdn.net') && // Skip CDN placeholder images
                                  !src.includes('scontent')) // Skip small content images
                    .filter((url, index, self) => self.indexOf(url) === index); // Remove duplicates
                
                return urls;
            });

            if (imageUrls.length > 0) {
                console.log(`[${this.postUrl}] Found ${imageUrls.length} post images`);
                await savePostImages(this.postUrl, imageUrls);
            } else {
                console.log(`[${this.postUrl}] No post images found`);
            }
        } catch (e) {
            console.error(`[${this.postUrl}] Image scrape failed:`, e.message);
        }
    }

    async broadcastState(status) {
        const allBids = await getHighestBids(this.postUrl);
        const images = await getPostImages(this.postUrl);
        
        const userParticipatedItems = new Set();
        allBids.forEach(bid => {
            if (bid.bidder_name && bid.bidder_name.toLowerCase().includes(this.myName.toLowerCase())) {
                userParticipatedItems.add(bid.item_number);
            }
        });

        const itemsMap = {};
        allBids.forEach(bid => {
            if (!itemsMap[bid.item_number]) itemsMap[bid.item_number] = [];
            itemsMap[bid.item_number].push(bid);
        });
        
        const items = Object.keys(itemsMap).map(itemNum => {
            const bids = itemsMap[itemNum].sort((a, b) => b.amount - a.amount);
            const leader = bids[0];
            const history = bids.slice(0, 5);
            
            return {
                ...leader,
                history: history,
                isWinning: leader.bidder_name.toLowerCase().includes(this.myName.toLowerCase()),
                userHasBid: userParticipatedItems.has(parseInt(itemNum))
            };
        }).sort((a, b) => a.item_number - b.item_number);

        // Get post number from database
        const { data: postData } = await supabase
            .from('bidding_posts')
            .select('post_number')
            .eq('post_url', this.postUrl)
            .single();

        io.emit('update', {
            postUrl: this.postUrl,
            postNumber: postData?.post_number || this.postNumber || '???',
            items,
            images,
            lastUpdated: new Date().toISOString(),
            status: status || 'Active'
        });
    }
}

// --- API ROUTES ---

app.post('/watch', async (req, res) => {
    const { postUrl, intervalSec, myName, createdBy } = req.body;
    
    if (!postUrl || !myName) return res.status(400).json({ error: "Missing fields" });

    if (watchersMap.has(postUrl)) {
        return res.json({ message: "Already watching this post" });
    }

    if (watchersMap.size >= 20) {
        return res.status(400).json({ error: "Max 20 active watchers allowed." });
    }

    const watcher = new FacebookWatcher(postUrl, intervalSec || 120, myName, createdBy || 'admin');
    watchersMap.set(postUrl, watcher);
    watcher.start();

    res.json({ success: true, message: "Watcher started" });
});

app.post('/stop', async (req, res) => {
    const { postUrl } = req.body;
    
    if (postUrl) {
        const watcher = watchersMap.get(postUrl);
        if (watcher) await watcher.stop();
        watchersMap.delete(postUrl);
    } else {
        for (const [url, watcher] of watchersMap) {
            await watcher.stop();
        }
        watchersMap.clear();
    }
    
    res.json({ success: true });
});

app.get('/status', async (req, res) => {
    const status = {};
    for (const [url, watcher] of watchersMap) {
        status[url] = { isRunning: watcher.isRunning };
    }
    res.json(status);
});

app.get('/cookies', (req, res) => {
    // Set CORS headers explicitly
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    
    const exists = require('fs').existsSync('cookies.json');
    res.json({ exists });
});

app.post('/cookies', (req, res) => {
    // Set CORS headers explicitly
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    
    try {
        const cookies = req.body;
        if (!Array.isArray(cookies)) {
            return res.status(400).json({ error: "Invalid cookie format. Must be an array." });
        }
        require('fs').writeFileSync('cookies.json', JSON.stringify(cookies, null, 2));
        console.log("Cookies updated via API");
        res.json({ success: true, message: "Cookies saved successfully" });
    } catch (e) {
        console.error("Failed to save cookies:", e);
        res.status(500).json({ error: "Internal server error" });
    }
});

app.post('/upload', async (req, res) => {
    const { imageBase64 } = req.body;
    if (!imageBase64) return res.status(400).json({ error: "Missing image data" });
    
    try {
        const url = await uploadToCloudinary(imageBase64);
        if (!url) throw new Error("Cloudinary upload returned null");
        res.json({ success: true, url });
    } catch (e) {
        console.error("Upload error:", e.message);
        res.status(500).json({ error: e.message });
    }
});

app.post('/images', async (req, res) => {
    const { postUrl, imageUrls } = req.body;
    if (!postUrl || !imageUrls || !Array.isArray(imageUrls)) {
        return res.status(400).json({ error: "Invalid data" });
    }
    
    console.log(`[${postUrl}] Received manual images:`, imageUrls.length);
    await savePostImages(postUrl, imageUrls);
    
    const watcher = watchersMap.get(postUrl);
    if (watcher) watcher.broadcastState('Active');

    res.json({ success: true });
});

// --- POLL SUPABASE FOR ACTIVE WATCHERS ---

async function pollSupabaseWatchers() {
    try {
        // Get all active watchers from Supabase
        const { data: watchers, error } = await supabase
            .from('bidding_watchers')
            .select('post_url, my_name, interval_sec, created_by, is_running')
            .eq('is_running', true);
        
        if (error) {
            console.error('Error polling watchers:', error);
            return;
        }
        
        if (!watchers) return;
        
        // Start watchers that aren't running yet
        for (const watcher of watchers) {
            if (!watchersMap.has(watcher.post_url)) {
                console.log(`[Poll] Starting watcher for: ${watcher.post_url}`);
                const fbWatcher = new FacebookWatcher(
                    watcher.post_url,
                    watcher.interval_sec || 120,
                    watcher.my_name,
                    watcher.created_by || 'admin'
                );
                watchersMap.set(watcher.post_url, fbWatcher);
                fbWatcher.start();
            }
        }
        
        // Stop watchers that are no longer active in Supabase
        for (const [postUrl, fbWatcher] of watchersMap.entries()) {
            const stillActive = watchers.some(w => w.post_url === postUrl);
            if (!stillActive && fbWatcher.isRunning) {
                console.log(`[Poll] Stopping watcher for: ${postUrl}`);
                await fbWatcher.stop();
            }
        }
        
    } catch (e) {
        console.error('Error in pollSupabaseWatchers:', e);
    }
}

// Poll Supabase every 10 seconds for active watchers
setInterval(pollSupabaseWatchers, 10000);

// Initial poll on startup
setTimeout(pollSupabaseWatchers, 2000);

// --- START SERVER ---

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Using Supabase for storage: ${SUPABASE_URL}`);
    console.log(`Headless mode: ${HEADLESS}`);
    console.log(`Polling Supabase for active watchers every 10 seconds...`);
});

process.on('SIGINT', async () => {
    console.log("Stopping all watchers...");
    for (const watcher of watchersMap.values()) {
        await watcher.stop();
    }
    process.exit();
});

