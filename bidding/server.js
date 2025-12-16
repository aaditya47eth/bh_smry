/**
 * server.js
 * Backend for Facebook Auction Tracker.
 * Handles Puppeteer automation, JSON file storage, and Socket.IO updates.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const puppeteer = require('puppeteer-core');

// --- CONFIGURATION & SETUP ---

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'bids.json');
const POSTS_DB_FILE = path.join(__dirname, 'posts.json');

const CHROME_EXEC_PATH = process.env.CHROME_EXEC_PATH; // Path to Chrome executable
const CHROME_PROFILE_DIR = process.env.CHROME_PROFILE_DIR; // Path to User Data
const HEADLESS = process.env.HEADLESS !== 'false'; // Default to true unless specified

// Cloudinary Config
const CLOUDINARY_CLOUD_NAME = 'dt5jgkfwb';
const CLOUDINARY_UPLOAD_PRESET = 'review_strg';

if (!CHROME_EXEC_PATH) {
    console.error("ERROR: CHROME_EXEC_PATH is not set in .env file.");
}

// --- JSON DATABASE SETUP ---

function loadJson(file, defaultVal) {
    try {
        if (fs.existsSync(file)) {
            return JSON.parse(fs.readFileSync(file, 'utf-8'));
        }
    } catch (e) {
        console.error(`Error reading ${file}:`, e);
    }
    return defaultVal;
}

function saveJson(file, data) {
    try {
        fs.writeFileSync(file, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error(`Error saving ${file}:`, e);
    }
}

// In-memory cache
let bidsDb = loadJson(DB_FILE, []);
let postsDb = loadJson(POSTS_DB_FILE, {}); // { postUrl: { images: [] } }

// OCR Cache: { url: text }
const ocrCache = new Map();

// Lazy load Tesseract only when needed to avoid heavy startup if not used
let Tesseract = null;
async function getTesseract() {
    if (!Tesseract) {
        const tesseractModule = await import('tesseract.js');
        Tesseract = tesseractModule.default;
    }
    return Tesseract;
}

function insertBid(postUrl, item, amount, bidder, rawComment, relativeTime, commentImages = []) {
    const exists = bidsDb.find(b => 
        b.post_url === postUrl && 
        b.item_number === item && 
        b.amount === amount && 
        b.bidder_name === bidder
    );
    
    if (!exists) {
        bidsDb.push({
            id: Date.now() + Math.random(),
            post_url: postUrl,
            item_number: item,
            amount: amount,
            bidder_name: bidder,
            raw_comment: rawComment,
            timestamp: new Date().toISOString(), // System time
            relative_time: relativeTime || "",    // Scraped time (e.g. "4m")
            comment_images: commentImages        // Store images
        });
        saveJson(DB_FILE, bidsDb);
        return true; 
    }
    return false; 
}

function savePostImages(postUrl, imageUrls) {
    if (!postsDb[postUrl]) {
        postsDb[postUrl] = { images: [] };
    }
    // Always update if we have images
    if (imageUrls.length > 0) {
        postsDb[postUrl].images = imageUrls;
        saveJson(POSTS_DB_FILE, postsDb);
    }
}

function getPostImages(postUrl) {
    return postsDb[postUrl]?.images || [];
}

function getHighestBids(postUrl) {
    return bidsDb.filter(b => b.post_url === postUrl);
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

// CORS helper function
function setCorsHeaders(res) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
}

// CORS middleware - must be before routes
app.use((req, res, next) => {
    setCorsHeaders(res);
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Send current state to new clients
io.on('connection', (socket) => {
    console.log('Client connected');
    for (const watcher of watchers.values()) {
        watcher.broadcastState('Active');
    }
});

app.use(express.static('public'));
app.use(express.json({ limit: '50mb' }));

// Watchers Map: postUrl -> FacebookWatcher instance
const watchers = new Map();

// --- SCRAPING LOGIC ---

const sleep = (ms) => new Promise(r => setTimeout(r, ms + Math.random() * 1000));

function parseBids(text) {
    // Split by newlines
    const lines = text.split(/\r?\n/);
    const bids = [];
    
    // Regex 1: Summary format "Item.Price-BidderName"
    // Improved: Handles OCR noise like "1. 510" "1.510" "1 . 510" "14.90"
    // Relaxed spacing and dots
    const summaryRegex = /^(\d+)\s*[\.,\s]*\s*([0-9,]+)\s*[-–—−]\s*(.+)/i;

    // Regex 2: Standard format "Item. Price" (Global for multiple per line)
    const standardRegexGlobal = /(\d{1,3})\s*[\)\.:\-]?\s*(?:[₹Rsrs.]*\s*)?([0-9,]+)/gi;

    for (const line of lines) {
        const cleanLine = line.trim();
        if (!cleanLine) continue;

        // Try Summary Format first (more specific, captures Name)
        const summaryMatch = cleanLine.match(summaryRegex);
        if (summaryMatch) {
            const item = parseInt(summaryMatch[1], 10);
            // Fix Amount: OCR often puts spaces in numbers "1 500" or dots "1.500"
            const amountRaw = summaryMatch[2].replace(/[,.\s]/g, '');
            const amount = parseInt(amountRaw, 10);
            const bidder = summaryMatch[3].trim();
            
            // Validation: Item must be 1-50, Amount must be >= 10
            if (item >= 1 && item <= 50 && amount >= 10) {
                // Skip if bidder is known seller account
                if (bidder && (bidder.toLowerCase().includes('pnk pranakorn') || bidder.toLowerCase().includes('tdmd pranakorntoys'))) {
                    continue;
                }
                bids.push({ item, amount, bidder }); 
                continue; 
            }
        }

        // Try Standard Format (Multiple matches allowed)
        const matches = [...cleanLine.matchAll(standardRegexGlobal)];
        for (const match of matches) {
            const item = parseInt(match[1], 10);
            const amountRaw = match[2].replace(/[,.\s]/g, ''); 
            const amount = parseInt(amountRaw, 10);
            
            // Validation: Item must be 1-50, Amount must be >= 10
            if (item >= 1 && item <= 50 && amount >= 10) {
                bids.push({ item, amount, bidder: null }); 
            }
        }
    }
    return bids;
}

class FacebookWatcher {
    constructor(postUrl, intervalSec, myName) {
        this.postUrl = postUrl;
        // Increase minimum safety interval to 30 seconds to prevent blocks
        this.intervalMs = Math.max(intervalSec * 1000, 30000); 
        this.myName = myName;
        this.isRunning = false;
        this.browser = null;
        this.page = null;
        this.postNumber = null; // Store extracted Post_No
    }

    async start() {
        if (this.isRunning) return;
        this.isRunning = true;
        console.log(`Starting watcher for: ${this.postUrl}`);
        
        try {
            await this.initBrowser();
            this.loop();
        } catch (e) {
            console.error(`[${this.postUrl}] Failed to init:`, e);
            this.stop();
        }
    }

    async stop() {
        this.isRunning = false;
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
        console.log(`[${this.postUrl}] Watcher stopped.`);
        // Remove self from global map
        watchers.delete(this.postUrl);
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
            args: launchArgs,
            defaultViewport: null
        });

        this.page = await this.browser.newPage();
        await this.page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36');

        if (!CHROME_PROFILE_DIR && fs.existsSync('cookies.json')) {
            const cookies = JSON.parse(fs.readFileSync('cookies.json', 'utf-8'));
            await this.page.setCookie(...cookies);
        }
    }

    async loop() {
        let firstRun = true;
        while (this.isRunning) {
            try {
                if (firstRun) {
                    console.log(`[${this.postUrl}] Opening page...`);
                    await this.page.goto(this.postUrl, { waitUntil: 'networkidle2', timeout: 60000 });
                    
                    console.log(`[${this.postUrl}] Waiting 5 seconds for manual interaction (expand comments if needed)...`);
                    await sleep(5000); // Give user time to expand manually
                    
                    // First scrape immediately after the wait
                    console.log(`[${this.postUrl}] Initial Scraping...`);
                    await this.scrape(true, true); // Pass true to skip navigation since we are already there
                    
                    firstRun = false;
                } else {
                    // Regular interval scraping
                    console.log(`[${this.postUrl}] Reloading & Scraping...`);
                    // Reload page to get updates
                    await this.page.reload({ waitUntil: 'networkidle2' });
                    // Small wait to prevent detached frame issues
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

    // Helper to run OCR on an image URL
    async runOcr(imageUrl) {
        if (ocrCache.has(imageUrl)) return ocrCache.get(imageUrl);
        
        // Skip data URIs or SVGs which are often icons/stickers
        if (imageUrl.startsWith('data:') || imageUrl.includes('.svg')) return "";

        try {
            const ts = await getTesseract();
            console.log(`[OCR] Scanning: ${imageUrl.substring(0, 50)}...`);
            
            // Pre-process or configure for better numbers?
            // Tesseract.js allows config. We can try 'eng' but maybe setting whitelist helps?
            // For now, let's just run it. We might need to preprocess the image (grayscale/contrast) 
            // if we had an image library, but we want to keep deps low.
            // We will rely on robust regex later.
            
            const { data: { text } } = await ts.recognize(imageUrl);
            
            // Clean text: Fix common OCR mistakes for this context
            // 1. "O" or "o" or "D" -> "0" at start of line or in numbers
            // 2. "l" or "I" -> "1"
            // 3. Spaces in numbers "1 500" -> "1500"
            
            const cleanText = text
                .replace(/\n/g, ' \n ') // Preserve newlines as spaces for now, or handle better
                .replace(/[|lI]/g, '1') // Common mistake
                .replace(/[O]/g, '0');  // Common mistake

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
                // We already navigated or reloaded in the loop
            }
        } catch (e) {
            console.warn(`[${this.postUrl}] Navigation error:`, e.message);
            return;
        }

        // 0. Scrape Post Number (if not found yet)
        if (!this.postNumber) {
            try {
                this.postNumber = await this.page.evaluate(() => {
                    const text = document.body.innerText;
                    const match = text.match(/Post_No\.([\w\.-]+)/i);
                    return match ? match[1] : null;
                });
                if (this.postNumber) console.log(`[${this.postUrl}] Found Post Number: ${this.postNumber}`);
            } catch (e) {
                console.log(`[${this.postUrl}] Post Number scrape failed:`, e.message);
            }
        }

        // 1. Scrape Images (First run only or if missing)
        const currentImages = getPostImages(this.postUrl);
        if (currentImages.length === 0) {
            await this.scrapeImages();
        }

        // 1.5. Switch to "All Comments" mode (Crucial for seeing all bids)
        try {
             await this.page.evaluate(async () => {
                const getByText = (text) => {
                    // Look for text in span or div, strict matching for menu items
                    const xpath = `//span[normalize-space()="${text}"] | //div[role="menuitem"]//span[contains(., "${text}")]`;
                    const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
                    return result.singleNodeValue;
                };

                // Find the dropdown trigger (usually says "Most relevant" or "Top comments")
                // We use a looser xpath for the trigger
                const triggerXpath = `//span[contains(text(), "Most relevant")] | //span[contains(text(), "Top comments")]`;
                const triggerResult = document.evaluate(triggerXpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
                const filterButton = triggerResult.singleNodeValue;

                if (filterButton) {
                    // Only click if we haven't already (check if menu is open?) 
                    // Hard to check, so we just try.
                    filterButton.click();
                    await new Promise(r => setTimeout(r, 1500));
                    
                    const allCommentsOption = getByText("All comments");
                    if (allCommentsOption) {
                        allCommentsOption.click();
                        await new Promise(r => setTimeout(r, 3000)); // Wait for reload
                    }
                }
             });
        } catch (e) {
            console.log(`[${this.postUrl}] Filter switch error (ignoring):`, e.message);
        }

        // 2. Expand Comments (Pagination & Inline)
        try {
            // Initial scroll
            await this.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await sleep(2000);

            // Expansion loop - LESS aggressive to avoid blocks
            // We look for "View more comments", "View previous comments", "See more"
            const maxExpands = isFirstRun ? 25 : 5; // Increased from 15 to 25
            
            for (let i = 0; i < maxExpands; i++) {
                const result = await this.page.evaluate(async () => {
                    // Helper to find clickable elements by text
                    const getByText = (text) => {
                        const xpath = `//div[@role="button"][contains(., "${text}")] | //span[contains(., "${text}")] | //a[contains(., "${text}")]`;
                        const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
                        return result.singleNodeValue;
                    };

                    // Priority 1: "View previous comments" (loads older history)
                    // Priority 2: "View more comments"
                    const prevComments = getByText("View previous comments") || getByText("View more comments") || getByText("View 1 more comment");
                    
                    if (prevComments) {
                        // Check if it's visible
                        if (prevComments.offsetParent === null) return false;
                        prevComments.click();
                        return 'pagination';
                    }

                    // Priority 3: "See more" (inline expansion for long comments)
                    const seeMore = getByText("See more");
                    if (seeMore && seeMore.offsetParent !== null) {
                        seeMore.click();
                        return 'inline';
                    }

                    return false;
                });

                if (result) {
                    // Wait longer for pagination loads
                    await new Promise(r => setTimeout(r, result === 'pagination' ? 3000 : 500));
                } else {
                    break;
                }
            }
        } catch (e) {
            console.log(`[${this.postUrl}] Expand error:`, e.message);
        }

        // 3. Extract Comments
        const comments = await this.page.evaluate(() => {
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
                    
                    // Join with newline to preserve structure for multi-bid parsing
                    const content = lines.slice(1).join('\n'); 
                    
                    // Extract Images in Comment
                    const images = [];
                    const imgNodes = node.querySelectorAll('a[href*="photo.php"], a[href*="/photos/"], div[role="button"] img');
                    imgNodes.forEach(img => {
                        const src = img.src || img.querySelector('img')?.src;
                        if (src) images.push(src);
                    });

                    // Attempt to extract timestamp (often a link or text at bottom like "4m", "1h")
                    // We look for a time-like string in the node's text or specific timestamp elements
                    let timestampStr = new Date().toISOString(); // Default
                    
                    // Try to find the timestamp element (usually a link to the comment)
                    const timeLink = node.querySelector('a[href*="comment_id="], a[href*="reply_comment_id="], span > a[role="link"]');
                    if (timeLink) {
                        const t = timeLink.innerText;
                        // specific checks for "1h", "4m", "Just now"
                        if (t && (t.match(/\d+[mhdy]/) || t.includes('Just now') || t.includes('Yesterday'))) {
                            timestampStr = t;
                        }
                    }

                    results.push({ author, content, timestampStr, images });
                }
            });
            return results;
        });

        // 4. Process Bids
        let newBidsCount = 0;
        for (const c of comments) {
            // Prepare content for parsing
            let contentToParse = c.content;

            // OCR Logic: If comment has images, OCR them and append text
            if (c.images.length > 0) {
                for (const imgUrl of c.images) {
                    // Only run OCR if the image looks like it might contain a summary list
                    // Optimisation: Run OCR if comment length is short OR contains keywords like "Summary"
                    // Or just run it for all images in comments (might be slow but thorough)
                    // Given user request "sometime the summaries are mentioned like this (in image)", we should check.
                    
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
                    // Pass the scraped timestamp string (e.g., "4m") 
                    const added = insertBid(this.postUrl, bid.item, bid.amount, finalBidder, c.content, c.timestampStr, c.images);
                    if (added) newBidsCount++;
                } catch (e) {
                    // Ignore
                }
            }
        }
        console.log(`[${this.postUrl}] ${comments.length} comments scanned. ${newBidsCount} new bids saved.`);
    }

    async scrapeImages() {
        console.log(`[${this.postUrl}] Scraping visible images...`);
        try {
            // Static scrape only - no clicking/galleries to avoid issues
            const imageUrls = await this.page.evaluate(() => {
                const container = document.querySelector('div[role="article"]') || document.querySelector('div[role="feed"]') || document.body;
                const allImgs = Array.from(container.querySelectorAll('img'));
                
                const candidates = allImgs.filter(img => {
                    const rect = img.getBoundingClientRect();
                    const width = img.naturalWidth || rect.width;
                    const height = img.naturalHeight || rect.height;
                    return width > 150 && height > 150; 
                });

                const urls = candidates.map(img => img.src).filter(src => src.startsWith('http'));
                return [...new Set(urls)];
            });

            if (imageUrls.length > 0) {
                // Upload logic removed for speed if relying on manual paste, or keep as fallback
                savePostImages(this.postUrl, imageUrls);
            }
        } catch (e) {
            console.error(`[${this.postUrl}] Image scrape failed:`, e.message);
        }
    }

    // Proxy to global helper
    async uploadImage(url) {
        // Need to run this in Node context, not browser context
        return await uploadToCloudinary(url);
    }

    broadcastState(status) {
        const allBids = getHighestBids(this.postUrl);
        const images = getPostImages(this.postUrl);
        
        // Check which items user has ever bid on
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
             const history = bids.slice(0, 5); // Top 5 history
             
             return {
                 ...leader,
                 history: history,
                 isWinning: leader.bidder_name.toLowerCase().includes(this.myName.toLowerCase()),
                 userHasBid: userParticipatedItems.has(parseInt(itemNum))
             };
        }).sort((a, b) => a.item_number - b.item_number);

        io.emit('update', {
            postUrl: this.postUrl,
            postNumber: this.postNumber || '???',
            items,
            images,
            lastUpdated: new Date().toISOString(),
            status: status || 'Active'
        });
    }
}

// --- API ROUTES ---

app.post('/watch', async (req, res) => {
    setCorsHeaders(res);
    const { postUrl, intervalSec, myName } = req.body;
    
    if (!postUrl || !myName) return res.status(400).json({ error: "Missing fields" });

    if (watchers.has(postUrl)) {
        return res.json({ message: "Already watching this post" });
    }

    // Limit to 20 watchers
    if (watchers.size >= 20) {
        return res.status(400).json({ error: "Max 20 active watchers allowed." });
    }

    const watcher = new FacebookWatcher(postUrl, intervalSec || 20, myName);
    watchers.set(postUrl, watcher);
    watcher.start();

    res.json({ success: true, message: "Watcher started" });
});

app.post('/stop', async (req, res) => {
    setCorsHeaders(res);
    const { postUrl } = req.body;
    
    if (postUrl) {
        const watcher = watchers.get(postUrl);
        if (watcher) await watcher.stop();
        watchers.delete(postUrl);
    } else {
        // Stop all
        for (const [url, watcher] of watchers) {
            await watcher.stop();
        }
        watchers.clear();
    }
    
    res.json({ success: true });
});

app.get('/status', (req, res) => {
    setCorsHeaders(res);
    const status = {};
    for (const [url, watcher] of watchers) {
        status[url] = { isRunning: watcher.isRunning };
    }
    res.json(status);
});

app.get('/cookies', (req, res) => {
    setCorsHeaders(res);
    const exists = fs.existsSync('cookies.json');
    res.json({ exists });
});

app.post('/cookies', (req, res) => {
    setCorsHeaders(res);
    try {
        const cookies = req.body;
        if (!Array.isArray(cookies)) {
            return res.status(400).json({ error: "Invalid cookie format. Must be an array." });
        }
        fs.writeFileSync('cookies.json', JSON.stringify(cookies, null, 2));
        console.log("Cookies updated via API");
        res.json({ success: true, message: "Cookies saved successfully" });
    } catch (e) {
        console.error("Failed to save cookies:", e);
        res.status(500).json({ error: "Internal server error" });
    }
});

// Expose upload endpoint for clipboard images
app.post('/upload', async (req, res) => {
    setCorsHeaders(res);
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
    setCorsHeaders(res);
    const { postUrl, imageUrls } = req.body;
    if (!postUrl || !imageUrls || !Array.isArray(imageUrls)) {
        return res.status(400).json({ error: "Invalid data" });
    }
    
    console.log(`[${postUrl}] Received manual images:`, imageUrls.length);
    
    // Upload to Cloudinary if needed, or just save direct links
    // Assuming user pastes direct links, we save them.
    // If they are base64, we might need upload.
    // For now, we just save what is sent.
    
    // Append to existing or overwrite? Overwrite is safer for manual correction.
    savePostImages(postUrl, imageUrls);
    
    // Force broadcast update if watcher exists
    const watcher = watchers.get(postUrl);
    if (watcher) watcher.broadcastState('Active');

    res.json({ success: true });
});

// --- START SERVER ---

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Headless mode: ${HEADLESS}`);
});

process.on('SIGINT', async () => {
    console.log("Stopping all watchers...");
    for (const watcher of watchers.values()) {
        await watcher.stop();
    }
    process.exit();
});
