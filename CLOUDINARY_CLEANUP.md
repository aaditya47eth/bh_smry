# Cloudinary Image Cleanup Guide

## Why Manual Cleanup is Needed

Cloudinary image deletion requires your API secret, which **cannot be safely exposed in client-side JavaScript code**. For security reasons, the application only removes review images from the database, but the actual image files remain in Cloudinary until manually deleted.

## How to Clean Up Images

### Method 1: Cloudinary Dashboard (Manual)

1. Go to [Cloudinary Console](https://cloudinary.com/console)
2. Log in to your account (`daye1yfzy`)
3. Navigate to **Media Library**
4. Open the **user_reviews** folder
5. Check the browser console logs for image URLs that need to be deleted
6. Manually select and delete those images

### Method 2: Server-Side Implementation (Recommended for Production)

For automatic deletion, you need to implement a server-side API endpoint:

```javascript
// Example Node.js/Express endpoint
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: 'daye1yfzy',
  api_key: 'YOUR_API_KEY',
  api_secret: 'YOUR_API_SECRET' // Keep this secret!
});

app.delete('/api/delete-image', async (req, res) => {
  try {
    const { public_id } = req.body;
    const result = await cloudinary.uploader.destroy(public_id);
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
```

Then update your client-side code to call this endpoint instead of attempting direct deletion.

## Images to Track

The application logs image URLs in the browser console when:
- A review is deleted
- A review is rejected by admin
- An old review is replaced (max 2 images per user)

Look for console messages like:
```
Review deleted. Image URL (for manual Cloudinary cleanup): https://...
```

## Folder Structure

All review images are stored in:
```
/user_reviews/[image_filename]
```

## Best Practices

1. **Regular Cleanup**: Schedule weekly/monthly cleanups to remove unused images
2. **Track Deletions**: Keep a log of deleted review IDs and their image URLs
3. **Implement Server-Side**: For production, always use server-side deletion
4. **Monitor Storage**: Check Cloudinary storage usage to avoid exceeding your plan limits

## Security Note

⚠️ **Never** expose your Cloudinary API secret in client-side code, HTML, or JavaScript files that users can access. Always keep it on your server.

