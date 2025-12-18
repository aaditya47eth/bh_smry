const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
// Railway uses PORT environment variable, defaulting to 3000
const PORT = process.env.PORT || 3000;

// Middleware to parse JSON bodies
app.use(express.json());

// Basic health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
});

// POST /scrape endpoint
app.post('/scrape', async (req, res) => {
    const { url } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'Missing "url" in request body' });
    }

    console.log(`Received scrape request for: ${url}`);

    let browser = null;
    try {
        // Launch Puppeteer
        // 'no-sandbox' and 'disable-setuid-sandbox' are often required for cloud environments (Render/Docker)
        browser = await puppeteer.launch({
            headless: 'new', // Use new headless mode
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage', // Important for Docker/Render (avoids shared memory crashes)
                '--disable-gpu'
            ],
            // On Railway with the correct Dockerfile, the path is standard
            executablePath: process.env.CHROME_EXEC_PATH || '/usr/bin/google-chrome-stable'
        });

        const page = await browser.newPage();

        // Set a reasonable timeout (e.g., 30 seconds)
        const timeout = 30000;
        page.setDefaultNavigationTimeout(timeout);

        // Set a generic User-Agent to avoid immediate blocking
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36');

        console.log(`Navigating to ${url}...`);
        
        // Navigate to URL and wait for network to be idle
        await page.goto(url, { waitUntil: 'networkidle2' });

        // Scrape data
        const data = await page.evaluate(() => {
            return {
                title: document.title,
                text: document.body.innerText.substring(0, 500) + '...', // First 500 chars visible
                // Example: Grab all links
                links: Array.from(document.querySelectorAll('a')).map(a => a.href).slice(0, 5)
            };
        });

        console.log('Scrape successful');
        res.json({ success: true, data });

    } catch (error) {
        console.error('Scrape error:', error);
        res.status(500).json({ 
            error: 'Scraping failed', 
            message: error.message 
        });
    } finally {
        if (browser) {
            await browser.close();
        }
    }
});

// Bind to 0.0.0.0 to ensure external access in containerized environments like Railway
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
