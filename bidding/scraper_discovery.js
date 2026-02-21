require('dotenv').config();
const puppeteer = require('puppeteer-core');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Config
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const CHROME_EXEC_PATH = process.env.CHROME_EXEC_PATH;
const HEADLESS = process.env.HEADLESS !== 'false';
const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_UPLOAD_PRESET = process.env.CLOUDINARY_UPLOAD_PRESET;
const TARGET_GROUP_URL = 'https://www.facebook.com/groups/307437849922910';

if (!SUPABASE_URL || !SUPABASE_KEY || !CHROME_EXEC_PATH) {
    console.error("Missing configuration. Please check .env file.");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
let browser = null;
let page = null;

async function uploadToCloudinary(imageUrl) {
    if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_UPLOAD_PRESET) {
        console.warn("   ⚠️ Cloudinary config missing. Skipping upload.");
        return null;
    }

    try {
        const formData = new FormData();
        formData.append('file', imageUrl);
        formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

        const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error(`Upload failed: ${response.statusText}`);
        }

        const data = await response.json();
        return data.secure_url;
    } catch (e) {
        console.error("   ❌ Cloudinary upload error:", e.message);
        return null;
    }
}

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

async function scrapeGroup(groupUrlStr) {
    console.log(`🔎 Exploring Group: ${groupUrlStr}`);
    try {
        // Force chronological sort to get recent posts
        const groupUrl = new URL(groupUrlStr);
        if (!groupUrl.searchParams.has('sorting_setting')) {
            groupUrl.searchParams.set('sorting_setting', 'CHRONOLOGICAL');
        }
        
        await page.goto(groupUrl.toString(), { waitUntil: 'networkidle2', timeout: 60000 });
        
        // Scroll and Scan Loop
        console.log("   Starting Scroll & Scan...");
        const allFoundPosts = new Map(); // Store all unique posts found across scrolls
        let stopScanning = false;

        // Initial wait for content
        await new Promise(r => setTimeout(r, 5000));

        for (let i = 0; i < 30; i++) {
            if (stopScanning) {
                console.log("   🛑 Stopping scroll: Found 'LOT JP'.");
                break;
            }

            console.log(`   🔄 Scan Step ${i + 1}/30...`);
            
            // 1. Scan for posts BEFORE scrolling
            const { results: posts, foundStopSignal } = await page.evaluate(() => {
                const results = [];
                let foundStopSignal = false;
                
                // Check page text for "LOT JP" signal
                if (document.body.innerText.includes('LOT JP')) {
                    foundStopSignal = true;
                }

                // 1. Find all "Post_No" links first to establish boundaries
                const allLinks = Array.from(document.querySelectorAll('a'));
                const postLinks = [];
                
                allLinks.forEach(a => {
                    const text = a.innerText.trim();
                    if (text.includes('Post_No.')) {
                        postLinks.push({ el: a, text: text, href: a.href });
                    }
                });

                // Helper to check if image is a real product image (not emoji/icon)
                const isRealImage = (img) => {
                    const rect = img.getBoundingClientRect();
                    const src = img.src || '';
                    
                    // Size check: must be substantial
                    if (rect.width < 150 || rect.height < 150) return false;
                    
                    // URL pattern check for emojis and static assets
                    if (src.includes('emoji') || 
                        src.includes('/images/emoji') || 
                        src.includes('static.xx.fbcdn.net') || 
                        src.includes('/rsrc.php/') ||
                        src.includes('/16/') || // Common emoji size path
                        src.includes('/32/') || // Common emoji size path
                        src.match(/\/p\d+x\d+\//)) { // Profile pic patterns often like p100x100
                        return false;
                    }
                    
                    return true;
                };

                // 2. Process each post link
                for (let i = 0; i < postLinks.length; i++) {
                    const currentLink = postLinks[i];
                    const nextLink = postLinks[i+1]; // Might be undefined if last
                    
                    const a = currentLink.el;
                    const text = currentLink.text;
                    const href = currentLink.href;

                    // Extract clean Post No
                    let postNoLabel = text;
                    const idMatch = text.match(/Post_No\.(\d+-\d+)/);
                    if (idMatch) {
                        postNoLabel = `Post_No.${idMatch[1]}`;
                    } else {
                        postNoLabel = text.replace(/\s+/g, ' ').substring(0, 30);
                    }

                    let cleanUrl = href;
                    try {
                        const u = new URL(href);
                        if (href.includes('/media/set/') || href.includes('.php')) {
                                cleanUrl = href; 
                        } else {
                                cleanUrl = `${u.origin}${u.pathname}`;
                        }
                        if (cleanUrl.includes('&type')) {
                            cleanUrl = cleanUrl.split('&type')[0];
                        }

                        // Skip main group URL if matched by accident
                        if (cleanUrl.includes('facebook.com/groups/307437849922910') && !cleanUrl.includes('/posts/') && !cleanUrl.includes('/permalink/')) {
                            continue;
                        }
                    } catch (e) {}

                    let isRecent = true;
                    let timeText = "Unknown";

                    // Extract Images using BOUNDARY logic
                    let extractedImages = [];
                    
                    const linkRect = a.getBoundingClientRect();
                    const nextLinkRect = nextLink ? nextLink.el.getBoundingClientRect() : null;
                    
                    // Define search area
                    // Start: slightly above link bottom (to catch aligned images)
                    const searchTop = linkRect.bottom - 20; 
                    // End: Top of next post OR a max limit (e.g. 2000px)
                    let searchBottom = linkRect.bottom + 2000;
                    if (nextLinkRect && nextLinkRect.top > linkRect.bottom) {
                        // If next post is below this one, use it as boundary
                        searchBottom = nextLinkRect.top;
                    }

                    // Find images in this range
                    const allSpecificImgs = Array.from(document.querySelectorAll('img.xz74otr'));
                    
                    let nearbyImages = allSpecificImgs.filter(img => {
                        const imgRect = img.getBoundingClientRect();
                        const imgMid = imgRect.top + (imgRect.height / 2);
                        return imgMid > searchTop && imgMid < searchBottom && isRealImage(img);
                    });

                    // Fallback to generic images if specific class not found
                    if (nearbyImages.length === 0) {
                            const allImgs = Array.from(document.querySelectorAll('img'));
                            nearbyImages = allImgs.filter(img => {
                            const imgRect = img.getBoundingClientRect();
                            const imgMid = imgRect.top + (imgRect.height / 2);
                            return imgMid > searchTop && imgMid < searchBottom && isRealImage(img);
                            });
                    }

                    // Sort by vertical distance
                    nearbyImages.sort((a, b) => {
                        return a.getBoundingClientRect().top - b.getBoundingClientRect().top;
                    });

                    extractedImages = nearbyImages.map(img => img.src).slice(0, 5);

                    if (isRecent) {
                        results.push({ 
                            url: cleanUrl, 
                            time: timeText, 
                            type: 'post_no', 
                            post_no: postNoLabel,
                            images: extractedImages,
                            debug_img_count: extractedImages.length
                        });
                    }
                }
                
                return { results, foundStopSignal };
            });

            if (foundStopSignal) {
                console.log("      Found 'LOT JP' signal. Stopping.");
                stopScanning = true;
            }

            // Add found posts to our collection
            posts.forEach(p => {
                // If we already have this post, merge the images if new ones are found
                if (allFoundPosts.has(p.url)) {
                    const existing = allFoundPosts.get(p.url);
                    if (p.images && p.images.length > 0 && (!existing.images || existing.images.length === 0)) {
                        existing.images = p.images;
                    }
                } else {
                    allFoundPosts.set(p.url, p);
                }
            });
            
            // Log image findings
            const postsWithImages = posts.filter(p => p.images && p.images.length > 0);
            console.log(`      Found ${posts.length} posts in this view (${postsWithImages.length} have images).`);

            if (stopScanning) {
                console.log("   🛑 Stopping scan loop early.");
                break;
            }

            // 2. Scroll down slowly AFTER scanning
            await page.evaluate(async () => {
                const distance = 100;
                const delay = 100;
                // Scroll for a bit
                let scrolled = 0;
                while(scrolled < 800) { // Scroll ~800px per step
                     window.scrollBy(0, distance);
                     scrolled += distance;
                     await new Promise(resolve => setTimeout(resolve, delay));
                }
            });
            
            // Wait for content to load
            await new Promise(r => setTimeout(r, 3000));
        }

        // Convert Map to Array for processing
        const uniquePosts = Array.from(allFoundPosts.values());
        console.log(`   Found ${uniquePosts.length} posts from the last ~24 hours.`);

        // Append to temp file (only new ones)
        if (uniquePosts.length > 0) {
            let existingUrls = new Set();
            if (fs.existsSync('found_posts.txt')) {
                const fileContent = fs.readFileSync('found_posts.txt', 'utf-8');
                fileContent.split('\n').forEach(line => {
                    const parts = line.split(' | ');
                    if (parts.length >= 3) {
                        existingUrls.add(parts[2].trim());
                    }
                });
            }

            const newPostsToFile = uniquePosts.filter(p => !existingUrls.has(p.url));

            if (newPostsToFile.length > 0) {
                const logContent = newPostsToFile.map(p => `${p.post_no} | ${p.time} | ${p.url}`).join('\n') + '\n';
                fs.appendFileSync('found_posts.txt', logContent);
                console.log(`   📝 Saved ${newPostsToFile.length} new posts to found_posts.txt`);
            } else {
                console.log(`   ℹ️  All ${uniquePosts.length} posts were already in found_posts.txt`);
            }
        }

        // Add new posts to Watchers
        for (const post of uniquePosts) {
            // Check if already watching
            const { data: watcherData } = await supabase
                .from('bidding_watchers')
                .select('id')
                .eq('post_url', post.url)
                .maybeSingle();
            
            // Check if post exists (to check images)
            const { data: postData } = await supabase
                .from('bidding_posts')
                .select('images')
                .eq('post_url', post.url)
                .maybeSingle();

            let shouldProcess = false;
            let isUpdate = false;

            if (!watcherData) {
                shouldProcess = true;
            } else if (postData && (!postData.images || postData.images.length === 0) && post.images.length > 0) {
                shouldProcess = true;
                isUpdate = true;
                console.log(`   ♻️  Backfilling images for existing post: ${post.post_no}`);
            }

            if (shouldProcess) {
                if (!isUpdate) {
                    console.log(`   ✨ New Post Found (${post.time}) [${post.post_no}]: ${post.url}`);
                }
                
                // Upload images
                let uploadedImages = [];
                // If update, preserve existing images if any (though logic says empty)
                if (post.images && post.images.length > 0) {
                    console.log(`   📸 Found ${post.images.length} images for ${post.post_no}. Uploading...`);
                    for (const imgUrl of post.images) {
                        const cdnUrl = await uploadToCloudinary(imgUrl);
                        if (cdnUrl) uploadedImages.push(cdnUrl);
                    }
                }

                // 1. Ensure Post exists (FK constraint) or Update
                if (isUpdate) {
                     const { error: updateError } = await supabase
                        .from('bidding_posts')
                        .update({ images: uploadedImages })
                        .eq('post_url', post.url);
                     
                     if (updateError) console.error("   Error updating post images:", updateError.message);
                     else console.log(`   ✅ Updated images for ${post.post_no}`);

                } else {
                    const { error: postError } = await supabase
                        .from('bidding_posts')
                        .insert([{ 
                            post_url: post.url,
                            images: uploadedImages 
                        }])
                        .select();
                    
                    // Ignore duplicate post error (23505)
                    if (postError && postError.code !== '23505') {
                        console.error("   Error creating post record:", postError.message);
                        continue;
                    }
                    
                    // If duplicate, update images just in case
                    if (postError && postError.code === '23505') {
                         await supabase.from('bidding_posts').update({ images: uploadedImages }).eq('post_url', post.url);
                    }

                    // 2. Create Watcher
                    // Try to get a valid user for 'created_by' to avoid FK errors
                    const { data: user } = await supabase.from('users').select('username').limit(1).maybeSingle();
                    const owner = user?.username || 'admin';

                    const { error: watcherError } = await supabase.from('bidding_watchers').insert([{
                        post_url: post.url,
                        my_name: `${post.post_no}`, 
                        created_by: owner, 
                        is_running: true,
                        interval_sec: 120
                    }]);

                    if (watcherError) {
                        console.error("   Error adding watcher:", watcherError.message);
                    }
                }
            }
        }

    } catch (e) {
        console.error(`Error exploring group ${groupUrlStr}:`, e.message);
    }
}

async function run() {
    await initBrowser();

    // 1. Load Cookies
    const cookies = await getCookies();
    if (cookies && Array.isArray(cookies)) {
        console.log("Loading cookies from Supabase...");
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

    // 2. Scrape Group
    await scrapeGroup(TARGET_GROUP_URL);

    console.log(`Done.`);
    process.exit(0);
}

// Main Loop
(async () => {
    await run();
})();
