# 🚂 Deploying to Railway

This guide helps you deploy the Facebook Auction Tracker backend to Railway.

## 1. Prerequisites

- A [Railway](https://railway.app/) account.
- Your project code pushed to GitHub (or use Railway CLI).
- Supabase credentials (URL and Key).

## 2. Setup in Railway

1.  **New Project**: Go to Railway dashboard, click "New Project" > "Deploy from GitHub repo".
2.  **Select Repository**: Choose your repository.
3.  **Root Directory**: 
    - You do **NOT** need to change the Root Directory anymore. I have added a `Dockerfile` to the root folder that handles everything.
    - If you already set it to `/bidding`, that is also fine (it will use the inner Dockerfile).
4.  **Environment Variables**:
    - Go to "Variables".
    - Add the following variables:
        - `SUPABASE_URL`: Your Supabase URL.
        - `SUPABASE_KEY`: Your Supabase Service Role Key (or Anon Key if configured).
        - `CHROME_EXEC_PATH`: `/usr/bin/google-chrome-stable` (Already set in Dockerfile, but good to verify).
        - `HEADLESS`: `true`

## 3. Deployment

Railway will automatically detect the `Dockerfile` in the `bidding/` folder and build the image.
- It installs Chrome.
- It installs Node.js dependencies.
- It starts `server-supabase.js`.

## 4. Public URL

1.  Go to "Settings" -> "Networking".
2.  Click "Generate Domain" to get a public URL (e.g., `https://your-project.up.railway.app`).
3.  Use this URL in your frontend code (if you have a frontend connecting to this).

## 5. Persistence (Cookies)

Since Railway containers are ephemeral (files are lost on restart), we use **Supabase** to store cookies.
- Use the **Admin Panel** in your frontend to "Refresh Cookies".
- This sends the cookies to the backend, which saves them to Supabase.
- When the backend restarts on Railway, it fetches the latest cookies from Supabase.

## Troubleshooting

- **Logs**: Check "Deploy Logs" and "App Logs" in Railway if something fails.
- **Memory**: Puppeteer can be memory intensive. If it crashes, try increasing the service's memory limit in Railway settings.

