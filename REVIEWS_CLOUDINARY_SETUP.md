# Setup Separate Cloudinary Account for Reviews

## Why Use a Separate Account?

Using a separate Cloudinary account for reviews gives you:
- ✅ **Additional 25 GB storage** (50 GB total across both accounts)
- ✅ **Separate quotas** for bandwidth and transformations
- ✅ **Risk isolation** - main app unaffected if review storage is exceeded
- ✅ **Easier management** - reviews and items are completely separated

## Step-by-Step Setup

### 1. Create New Cloudinary Account

1. Go to: https://cloudinary.com/users/register/free
2. Sign up with a different email address
   - **Tip**: If you use Gmail, you can use `your-email+reviews@gmail.com` (Gmail ignores the +reviews part)
3. Verify your email
4. Complete the registration

### 2. Get Your New Credentials

After logging into your new account:

1. Go to **Dashboard**
2. Copy your **Cloud Name** (e.g., `my-reviews-cloud`)
3. Go to **Settings** → **Upload**
4. Under **Upload presets**, click **"Add upload preset"**
5. Configure the preset:
   - **Preset name**: `reviews_upload` (or any name you prefer)
   - **Signing Mode**: Select **"Unsigned"**
   - **Folder**: Leave blank or set to `user_reviews`
   - Click **Save**
6. Copy the **Upload Preset Name**

### 3. Update Your Code

Open `/Users/em1048/Documents/test_project/bh/bh_smry/js/person_view.js` and update lines 10-11:

**Replace:**
```javascript
const REVIEWS_CLOUDINARY_CLOUD_NAME = 'daye1yfzy'; // TODO: Replace with your reviews account cloud name
const REVIEWS_CLOUDINARY_UPLOAD_PRESET = 'bh_smry_upload'; // TODO: Replace with your reviews upload preset
```

**With your new credentials:**
```javascript
const REVIEWS_CLOUDINARY_CLOUD_NAME = 'your-new-cloud-name'; // Your new reviews account
const REVIEWS_CLOUDINARY_UPLOAD_PRESET = 'reviews_upload'; // Your new upload preset
```

### 4. Test the Setup

1. Open your app in the browser
2. Go to any person view page
3. Click **"User Reviews"** tab
4. Click **"+ Add Review Image"**
5. Upload a test image
6. Check your **new Cloudinary account** → **Media Library** → You should see the image in the `user_reviews` folder

### 5. Verify Everything Works

✅ Review images upload successfully  
✅ Images appear in the **new** Cloudinary account  
✅ Item images still upload to the **original** account (test by adding items in lot view)  
✅ Dashboard review slider shows the images  

## Important Notes

- **Main account** (`daye1yfzy`) continues to be used for:
  - Item images in lot view
  - Any other uploads
  
- **Reviews account** (your new account) is used for:
  - User review images only
  - Dashboard review slider images

## Managing Both Accounts

### Main Account (Items):
- URL: https://cloudinary.com/console/c-{your-main-account-id}
- Folder: `items/` or root
- Usage: Item images for lots

### Reviews Account:
- URL: https://cloudinary.com/console/c-{your-reviews-account-id}
- Folder: `user_reviews/`
- Usage: User review images only

## Monitoring Storage

Check both accounts regularly:

**Main Account:**
1. Login to `daye1yfzy`
2. Check storage under **Usage**

**Reviews Account:**
1. Login to your new account
2. Check storage under **Usage**

## Cost Analysis

- **Current**: 25 GB (main account)
- **After Setup**: 50 GB total (25 GB + 25 GB)
- **Cost**: $0 (both free accounts)
- **When to Upgrade**: Only if either account exceeds 25 GB individually

## Troubleshooting

### Upload Fails with "Invalid signature"
- Make sure the upload preset is set to **"Unsigned"**
- Double-check the preset name matches exactly

### Images Not Showing
- Verify the cloud name is correct (no typos)
- Check browser console for errors
- Ensure the upload preset exists in the new account

### Still Using Old Account
- Clear browser cache
- Hard refresh (Ctrl+Shift+R or Cmd+Shift+R)
- Verify you updated the constants in `person_view.js`

## Benefits Summary

| Feature | Single Account | Two Accounts |
|---------|---------------|--------------|
| Storage | 25 GB | 50 GB |
| Cost | Free | Free |
| Risk | All in one | Isolated |
| Management | Mixed | Separated |
| Cleanup | Complex | Simple |

**Recommendation**: Set up the separate account now to avoid future storage issues! 🎉

