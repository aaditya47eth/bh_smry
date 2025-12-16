# 🚀 Client Handover & Deployment Guide

This system is designed to be **fully cloud-hosted**, meaning your client will only need a URL to access the tool. No local installation is required for them.

The system has two parts:
1.  **The Frontend (Website):** What the client sees (Admin Panel, Lot View).
2.  **The Backend (Scraper):** A background server that runs the automation (Puppeteer).

They connect via **Supabase** (Database), so they don't need to talk to each other directly.

---

## ✅ Part 1: Deploy the Frontend (Vercel)

This hosts the HTML/JS files.

1.  **Create a Vercel Account** at [vercel.com](https://vercel.com).
2.  **New Project:** Click "Add New..." -> "Project".
3.  **Upload:** Drag and drop this entire project folder (`bh_smry`) into Vercel (or connect via GitHub).
4.  **Settings:**
    *   **Root Directory:** Leave as `./` (Root).
    *   **Framework Preset:** Other (or None).
5.  **Deploy:** Click "Deploy".
6.  **Result:** You will get a URL like `https://bh-summary-maker.vercel.app`.
    *   This is the URL you give to your client.

---

## ✅ Part 2: Deploy the Backend (Render)

This hosts the automated scraper (Chrome/Puppeteer).

1.  **Create a Render Account** at [render.com](https://render.com).
2.  **Push Code to GitHub:** Upload your project code to a GitHub repository.
3.  **New Web Service:** In Render, click "New" -> "Web Service".
4.  **Connect Repo:** Select your GitHub repository.
5.  **Configure Settings:**
    *   **Name:** `fb-auction-scraper` (or similar)
    *   **Root Directory:** `bidding` (⚠️ Important: This tells it to look in the bidding folder)
    *   **Runtime:** `Docker` (Render will detect the Dockerfile we created)
    *   **Region:** Singapore (or closest to you/Facebook)
    *   **Instance Type:** Free (or Starter for better performance)
6.  **Environment Variables:** Add these (Copy from your `.env` or values below):
    *   `SUPABASE_URL`: `https://tqbeaihrdtkcroiezame.supabase.co`
    *   `SUPABASE_KEY`: *(Your Supabase Anon/Service Role Key)*
    *   `CHROME_EXEC_PATH`: `/usr/bin/google-chrome-stable`
    *   `HEADLESS`: `true`
    *   `CLOUDINARY_CLOUD_NAME`: `dt5jgkfwb`
    *   `CLOUDINARY_UPLOAD_PRESET`: `review_strg`
7.  **Deploy:** Click "Create Web Service".

Render will take about 5-10 minutes to build the Docker image (installing Chrome takes time). Once "Live", it is running 24/7.

---

## ✅ Part 3: Handover to Client

1.  **Give them the Frontend URL** (from Part 1).
2.  **Instructions:**
    *   "Go to this URL."
    *   "Login."
    *   "Go to Admin Panel -> 'Add Facebook Post'."
    *   "Paste the URL and click 'Watch All'."
    *   "Wait ~15-30 seconds. The status will turn green/active automatically."
3.  **Maintenance:**
    *   If they need to update Facebook Cookies, they can do it directly in the **Admin Panel** (there is a "Set Cookies" button). This saves the cookies to the database, which the Backend (Render) reads automatically.

---

## 🛠 Troubleshooting

*   **Status stuck at "Pending":** Check the Render logs. The backend might be restarting or blocked by Facebook login (update cookies in Admin Panel).
*   **"Outbid" status incorrect:** We fixed the logic to match names partially. Ensure the "My Name" they enter matches part of their Facebook name.

