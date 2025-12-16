# Facebook Auction Bid Tracker (Local Only)

**⚠️ LEGAL & TOS WARNING**
> **This software is for educational and personal automation purposes only.**
>
> **Risk of Account Suspension:** Using automated tools (bots/scrapers) to access Facebook may violate their Terms of Service. Facebook has strict anti-scraping policies. Using this tool with your primary personal account carries a risk of temporary or permanent restriction.
>
> **Recommendation:**
> 1. Use a **secondary/throwaway account** if possible.
> 2. Do not poll aggressively. The default interval is conservative (20s+).
> 3. **Do not** use this to spam or scrape public data in bulk.
> 4. This tool **does not** bypass authentication. You must be logged in via a local Chrome profile or provide valid cookies.

---

## Overview

This is a local Node.js application that monitors a specific Facebook post (e.g., an auction in a private group) for comments. It parses bids in the format `ItemNumber. Amount` (e.g., "1. 300", "5. 550"), tracks the highest bidder for each item, and updates a local web dashboard in real-time.

**Features:**
- **Local Execution:** Runs entirely on your machine. No data is sent to third-party servers.
- **Secure Auth:** Uses your existing Chrome Browser Profile or a local `cookies.json` file. **Never** asks for your password.
- **Real-time Dashboard:** Visualizes current prices and highlights if you have been outbid.
- **Resilience:** Includes exponential backoff, jitter (random delays), and SQLite storage to persist data.

## Prerequisites

1. **Node.js** (v16 or higher) installed.
2. **Google Chrome** installed.

## Installation

1. Clone or download this folder.
2. Open a terminal in the folder.
3. Install dependencies:
   ```bash
   npm install
   ```

## Configuration

### 1. Environment Variables
Create a `.env` file (copy from `.env.example`):
```bash
cp .env.example .env
```
Edit `.env` to set your Chrome path.

### 2. Authentication (Crucial)
You have two options to let the scraper access the private group.

#### Option A: Use your Chrome Profile (Recommended)
This method reuses your existing logged-in session.
1. Close all open Chrome windows.
2. Find your Chrome User Data directory:
   - **Windows:** `C:\Users\<YourUser>\AppData\Local\Google\Chrome\User Data`
   - **macOS:** `/Users/<YourUser>/Library/Application Support/Google/Chrome`
   - **Linux:** `~/.config/google-chrome`
3. Set `CHROME_PROFILE_DIR` in `.env` to this path.

#### Option B: Use Cookies.json
If you cannot close Chrome or use Docker:
1. Read `export_cookies_instructions.txt` to learn how to export cookies.
2. Save the file as `cookies.json` in the project root.
3. Ensure `CHROME_PROFILE_DIR` is empty in `.env`.

## Running the App

1. **Start the server:**
   ```bash
   npm start
   ```
   *For the first run, you might want to see the browser to ensure it's logged in:*
   ```bash
   HEADLESS=false npm start
   ```

2. **Open the Dashboard:**
   Go to `http://localhost:3000` in your browser.

3. **Start Watching:**
   - Paste the full URL of the Facebook post (click the timestamp of the post to get the permalink).
   - Enter your Facebook display name (so the app knows which bids are yours).
   - Click "Start Watching".

## Troubleshooting

- **"Browser closed unexpectedly":** Make sure you closed your main Chrome instances if using the Profile method. Chrome prevents two processes from using the same profile simultaneously.
- **Selectors failing:** Facebook changes their CSS classes frequently. This scraper attempts to use generic accessibility labels, but if the layout changes drastically, `server.js` selector logic may need updating.

