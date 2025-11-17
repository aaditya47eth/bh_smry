# Cloudinary Credentials Guide

## What are Cloudinary Credentials?

Cloudinary credentials are the information needed to upload and manage images in your Cloudinary account. Your application uses **unsigned upload presets**, which means you only need:

1. **Cloud Name** - Your Cloudinary account identifier
2. **Upload Preset** - A pre-configured setting that allows uploads without API keys

⚠️ **Important**: You do NOT need API keys or API secrets in your client-side code. The upload presets handle authentication automatically.

---

## Current Configuration

### Main Account (For Item Images)

**Location**: `js/lot_view.js` (lines 6-7)

```javascript
const CLOUDINARY_CLOUD_NAME = 'daye1yfzy';
const CLOUDINARY_UPLOAD_PRESET = 'bh_smry_upload';
```

**Used for**:
- Item images in lot view
- Images uploaded when adding items to lots

**Cloudinary Dashboard**: https://cloudinary.com/console/c-daye1yfzy

---

### Reviews Account (For Review Images)

**Location**: `js/person_view.js` (lines 10-11) and `js/admin_panel.js` (lines 1439-1440)

```javascript
const REVIEWS_CLOUDINARY_CLOUD_NAME = 'dt5jgkfwb';
const REVIEWS_CLOUDINARY_UPLOAD_PRESET = 'review_strg';
```

**Used for**:
- User review images
- Dashboard review slider images

**Cloudinary Dashboard**: https://cloudinary.com/console/c-dt5jgkfwb

---

## How to Find Your Cloudinary Credentials

### 1. Cloud Name

1. Go to [Cloudinary Console](https://cloudinary.com/console)
2. Log in to your account
3. Look at the top of the dashboard
4. Your **Cloud Name** is displayed (e.g., `daye1yfzy`)

### 2. Upload Preset

1. In Cloudinary Console, go to **Settings** → **Upload**
2. Scroll down to **Upload presets** section
3. Find your preset (e.g., `bh_smry_upload`)
4. Click on it to view/edit settings
5. Make sure it's set to **"Unsigned"** mode

---

## How to Create/Configure Upload Presets

### For Main Account:

1. Go to [Cloudinary Console](https://cloudinary.com/console)
2. Log in to account `daye1yfzy`
3. Go to **Settings** → **Upload**
4. Click **"Add upload preset"** or edit existing preset
5. Configure:
   - **Preset name**: `bh_smry_upload` (or any name)
   - **Signing Mode**: Select **"Unsigned"** ⚠️ (Important!)
   - **Folder**: Leave blank or set to `items/`
   - **Format**: Leave as default or select `auto`
   - Click **Save**

### For Reviews Account:

1. Log in to reviews account `dt5jgkfwb`
2. Go to **Settings** → **Upload**
3. Click **"Add upload preset"**
4. Configure:
   - **Preset name**: `review_strg` (or any name)
   - **Signing Mode**: Select **"Unsigned"** ⚠️ (Important!)
   - **Folder**: Leave blank or set to `user_reviews/`
   - Click **Save**

---

## What Credentials You DON'T Need

### ❌ API Key (Not Needed)
- Only needed for server-side operations
- Not required for unsigned upload presets

### ❌ API Secret (Not Needed - Keep Secret!)
- **NEVER** expose in client-side code
- Only needed for server-side operations (like deleting images)
- Keep this secret on your server only

---

## How to Verify Your Credentials Work

### Test Main Account:

1. Open your application
2. Go to any lot view page
3. Click **"+ Add New"** or **"Smart Paste"**
4. Paste or upload an image
5. If upload succeeds, your credentials are correct!

### Test Reviews Account:

1. Go to any person view page
2. Click **"User Reviews"** tab
3. Click **"+ Add Review Image"**
4. Upload a test image
5. Check the reviews account dashboard - image should appear

---

## Troubleshooting

### "Invalid signature" Error
- **Cause**: Upload preset is not set to "Unsigned"
- **Fix**: Go to Cloudinary Console → Settings → Upload → Edit preset → Set to "Unsigned"

### "Upload preset not found" Error
- **Cause**: Preset name doesn't match
- **Fix**: Check the preset name in Cloudinary Console matches exactly (case-sensitive)

### "Cloud name not found" Error
- **Cause**: Cloud name is incorrect
- **Fix**: Verify cloud name in Cloudinary Console dashboard

### Images Not Uploading
- Check browser console (F12) for error messages
- Verify you're using HTTPS (required for Cloudinary API)
- Make sure upload preset exists and is "Unsigned"
- Check Cloudinary account storage limits

---

## Security Notes

### ✅ Safe to Use in Client-Side Code:
- Cloud Name (public)
- Upload Preset (public, but unsigned)

### ⚠️ Never Expose in Client-Side Code:
- API Secret (keep on server only)
- API Key (only needed for server-side operations)

### 🔒 Best Practices:
1. Use **unsigned upload presets** (current setup) ✅
2. Set upload limits in preset settings (max file size, allowed formats)
3. Use folder organization (e.g., `items/`, `user_reviews/`)
4. Monitor storage usage regularly
5. Set up automated backups if needed

---

## Storage Limits (Free Tier)

### Main Account (`daye1yfzy`):
- **Storage**: 25 GB (free tier)
- **Bandwidth**: 25 GB/month (free tier)
- **Transformations**: 25,000/month (free tier)

### Reviews Account (`dt5jgkfwb`):
- **Storage**: 25 GB (free tier)
- **Bandwidth**: 25 GB/month (free tier)
- **Transformations**: 25,000/month (free tier)

**Total Available**: 50 GB storage across both accounts! 🎉

---

## Updating Credentials

If you need to change credentials:

1. **Update Cloud Name**:
   - Find in `js/lot_view.js` (line 6)
   - Find in `js/person_view.js` (line 10)
   - Find in `js/admin_panel.js` (line 1439)

2. **Update Upload Preset**:
   - Find in `js/lot_view.js` (line 7)
   - Find in `js/person_view.js` (line 11)
   - Find in `js/admin_panel.js` (line 1440)

3. **Test the changes**:
   - Try uploading an image
   - Check browser console for errors
   - Verify image appears in Cloudinary dashboard

---

## Summary

Your application currently uses:

| Account | Cloud Name | Upload Preset | Purpose |
|---------|-----------|---------------|---------|
| Main | `daye1yfzy` | `bh_smry_upload` | Item images |
| Reviews | `dt5jgkfwb` | `review_strg` | Review images |

**No API keys or secrets needed** - upload presets handle authentication automatically! ✅

---

## Need Help?

- **Cloudinary Dashboard**: https://cloudinary.com/console
- **Cloudinary Documentation**: https://cloudinary.com/documentation
- **Upload Presets Guide**: https://cloudinary.com/documentation/upload_presets


