# How to Run the Bidding Server

## Quick Start Guide

### Step 1: Install Dependencies

```bash
cd bidding
npm install
```

This installs all required packages including:
- `@supabase/supabase-js` - Supabase client
- `puppeteer-core` - Browser automation
- `express` - Web server
- `socket.io` - Real-time updates
- `tesseract.js` - OCR for image text extraction

### Step 2: Set Up Environment Variables

Create a `.env` file in the `bidding` directory:

```env
# Required: Path to Chrome executable
CHROME_EXEC_PATH=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome
# For Windows: C:\Program Files\Google\Chrome\Application\chrome.exe
# For Linux: /usr/bin/google-chrome

# Optional: Chrome User Data Directory (for auto-login)
CHROME_PROFILE_DIR=/Users/YourUsername/Library/Application Support/Google/Chrome
# Leave blank if using cookies.json instead

# Optional: Run in headless mode (true = no browser window, false = show browser)
HEADLESS=true

# Optional: Supabase (defaults to your existing Supabase if not set)
SUPABASE_URL=https://tqbeaihrdtkcroiezame.supabase.co
SUPABASE_KEY=your_supabase_anon_key

# Optional: Server port (defaults to 3000)
PORT=3000
```

### Step 3: Set Up Database

1. Go to your Supabase project
2. Open SQL Editor
3. Run the SQL from `../sql/ADD_BIDDING_TABLES.sql`
4. This creates the required tables:
   - `bidding_posts`
   - `bidding_watchers`
   - `bidding_bids`

### Step 4: Set Up Facebook Authentication

**Option A: Use Chrome Profile (Recommended)**
1. Find your Chrome User Data directory:
   - **Mac**: `/Users/YourUsername/Library/Application Support/Google/Chrome`
   - **Windows**: `C:\Users\YourUsername\AppData\Local\Google\Chrome\User Data`
   - **Linux**: `~/.config/google-chrome`
2. Set `CHROME_PROFILE_DIR` in `.env` to this path
3. Make sure Chrome is closed before running the server

**Option B: Use Cookies File**
1. Export cookies from your browser (see `export_cookies_instructions.txt`)
2. Save as `cookies.json` in the `bidding/` directory
3. Leave `CHROME_PROFILE_DIR` blank in `.env`

### Step 5: Run the Server

```bash
# Using the Supabase version (recommended)
node server-supabase.js

# Or using npm script (update package.json first)
npm run start:supabase
```

You should see:
```
Server running at http://localhost:3000
Using Supabase for storage: https://tqbeaihrdtkcroiezame.supabase.co
Headless mode: true
```

### Step 6: Use from Admin Panel

1. Open your admin panel in browser
2. Go to "Live Bidding" section
3. Add Facebook post URLs
4. The server will automatically start scraping and saving to Supabase
5. All users will see updates in real-time

## Troubleshooting

### "CHROME_EXEC_PATH not set"
- Make sure `.env` file exists and has `CHROME_EXEC_PATH` set
- Use the exact path to your Chrome executable

### "Browser closed unexpectedly"
- Close all Chrome windows before running
- Or use `cookies.json` instead of Chrome profile

### "Cannot connect to Supabase"
- Check your Supabase URL and key in `.env`
- Verify tables are created in Supabase

### Server won't start
- Make sure all dependencies are installed: `npm install`
- Check Node.js version (needs v16+)
- Check if port 3000 is already in use

## Running in Background

### Using PM2 (Recommended)
```bash
npm install -g pm2
pm2 start server-supabase.js --name bidding-server
pm2 save
pm2 startup  # Auto-start on system boot
```

### Using nohup (Linux/Mac)
```bash
nohup node server-supabase.js > bidding.log 2>&1 &
```

### Using screen (Linux/Mac)
```bash
screen -S bidding
node server-supabase.js
# Press Ctrl+A then D to detach
# Reattach with: screen -r bidding
```

## Stopping the Server

- **If running in terminal**: Press `Ctrl+C`
- **If using PM2**: `pm2 stop bidding-server`
- **If using nohup**: Find process and kill: `kill <PID>`

