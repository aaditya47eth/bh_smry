# Bidding Feature - Supabase Setup Guide

## Overview

This guide explains how to set up the bidding feature with **Supabase backend** for syncing data across all users and devices.

## Current vs Supabase Version

### Current (Local Only)
- **File**: `server.js`
- **Storage**: Local JSON files
- **Sync**: ❌ Not synced

### Supabase Version (Synced)
- **File**: `server-supabase.js`
- **Storage**: Supabase PostgreSQL
- **Sync**: ✅ Synced across all users/devices

## Setup Steps

### 1. Run Database Migration

1. Go to your Supabase project
2. Open SQL Editor
3. Run the SQL from `../sql/ADD_BIDDING_TABLES.sql`
4. Verify tables are created:
   - `bidding_posts`
   - `bidding_watchers`
   - `bidding_bids`

### 2. Install Dependencies

```bash
cd bidding
npm install
```

This will install `@supabase/supabase-js` along with other dependencies.

### 3. Update Environment Variables

Add to your `.env` file:

```env
# Existing
CHROME_EXEC_PATH=/path/to/chrome
CHROME_PROFILE_DIR=/path/to/user-data
HEADLESS=true

# Supabase (optional - defaults to your existing Supabase)
SUPABASE_URL=https://tqbeaihrdtkcroiezame.supabase.co
SUPABASE_KEY=your_supabase_anon_key
```

### 4. Use Supabase Server

Instead of running `server.js`, run:

```bash
node server-supabase.js
```

Or update `package.json`:

```json
"scripts": {
  "start": "node server-supabase.js",
  "start:local": "node server.js"
}
```

## How It Works

### Data Flow

1. **Server** scrapes Facebook posts using Puppeteer
2. **Server** saves bids to Supabase database
3. **Server** broadcasts updates via Socket.IO to all connected clients
4. **All users** see the same data in real-time

### Benefits

✅ **Synced across all devices** - All users see same auctions
✅ **Persistent storage** - Data survives server restarts  
✅ **Real-time updates** - Changes appear instantly
✅ **Multi-user** - Multiple admins can manage auctions
✅ **Scalable** - Can handle many concurrent watchers

### Frontend Connection

The admin panel already connects to the server via Socket.IO. When you use `server-supabase.js`:

- All users connected to the same server see the same data
- If you deploy the server (Vercel/Railway), all users worldwide see the same data
- Data is stored in Supabase, so it persists even if server restarts

## Deployment

### Option 1: Keep Server Local
- Run `server-supabase.js` on your local machine
- Only users on your network can connect
- Data still syncs via Supabase

### Option 2: Deploy Server (Recommended)
- Deploy to Vercel/Railway/Render
- All users worldwide can connect
- Data syncs globally via Supabase

### Deployment Example (Vercel)

1. Create `vercel.json`:
```json
{
  "version": 2,
  "builds": [
    {
      "src": "server-supabase.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "server-supabase.js"
    }
  ]
}
```

2. Deploy:
```bash
vercel --prod
```

3. Update frontend to connect to your deployed URL instead of `localhost:3000`

## Migration from Local to Supabase

If you have existing data in `bids.json`:

1. Run a migration script to import data to Supabase
2. Or start fresh - Supabase will store new data going forward

## Notes

- The server still needs Puppeteer (Chrome) to scrape Facebook
- Cookies are still stored locally in `cookies.json`
- Socket.IO broadcasts to all connected clients
- Supabase stores all bids, posts, and watchers

