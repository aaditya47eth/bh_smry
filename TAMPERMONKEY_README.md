# WhatsApp Copy Buyer & Copy Item - Tampermonkey Script

## Description

This Tampermonkey script adds "Copy Buyer" and "Copy Item" buttons to WhatsApp Web messages. It automatically extracts buyer information (phone number or name) and item images, uploads images to Cloudinary, and copies the formatted data to your clipboard.

## Features

- ✅ **Copy Buyer**: Extracts and copies buyer name/phone number from WhatsApp messages
- ✅ **Copy Item**: Extracts item image, uploads to Cloudinary, and formats data
- ✅ **Smart Image Capture**: Automatically captures high-resolution images from WhatsApp viewer
- ✅ **Price Extraction**: Automatically extracts price from image bubbles
- ✅ **Cloudinary Integration**: Uploads images to Cloudinary (daye1yfzy/bh_smry_upload)
- ✅ **Clipboard Integration**: Copies formatted data to clipboard for easy pasting

## Installation

### Step 1: Install Tampermonkey

1. **Chrome/Edge**: Install from [Chrome Web Store](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
2. **Firefox**: Install from [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/tampermonkey/)
3. **Safari**: Install from [Safari Extensions](https://apps.apple.com/app/tampermonkey/id1482490089)

### Step 2: Install the Script

1. Open Tampermonkey dashboard (click Tampermonkey icon → Dashboard)
2. Click **"Create a new script"**
3. Delete the default code
4. Copy the entire contents of `whatsapp-copy-buyer-item.user.js`
5. Paste it into the editor
6. Click **File → Save** (or press `Ctrl+S` / `Cmd+S`)

### Step 3: Configure Cloudinary (Optional)

The script uses these default Cloudinary credentials:
- **Cloud Name**: `daye1yfzy`
- **Upload Preset**: `bh_smry_upload`

To change these, edit the script and update lines 17-18:
```javascript
const CLOUD_NAME = 'your-cloud-name';
const UPLOAD_PRESET = 'your-upload-preset';
```

## Usage

### Copy Buyer

1. Hover over a WhatsApp message bubble
2. Click the **"Copy Buyer"** button (green button on the right)
3. Buyer name/phone number is copied to clipboard
4. A **"Copy Item"** button appears (blue button on the left)

### Copy Item

1. After copying buyer, click **"Copy Item"** button
2. The script will:
   - Find the associated image
   - Extract the image (high-resolution if needed)
   - Upload to Cloudinary
   - Extract price from the image bubble
   - Format data as: `buyer\nimage_url\nprice`
   - Copy to clipboard

### Force High-Resolution Capture

- **Shift+Click** the "Copy Item" button to force high-resolution image capture
- Useful when the thumbnail is too small

## Output Format

The script copies data in this format:
```
buyer_name_or_phone
https://res.cloudinary.com/.../image.jpg
price
```

Example:
```
John Doe
https://res.cloudinary.com/daye1yfzy/image/upload/v1234567890/item.jpg
1500
```

## Troubleshooting

### Buttons Not Appearing

1. **Refresh WhatsApp Web** (F5)
2. **Check Tampermonkey is enabled** (click Tampermonkey icon)
3. **Check script is enabled** in Tampermonkey dashboard
4. **Check browser console** (F12) for errors

### Upload Fails

1. **Check Cloudinary credentials** are correct
2. **Check upload preset** is set to "Unsigned" in Cloudinary
3. **Check browser console** (F12) for error messages
4. **Verify network connection**

### Image Not Found

1. Make sure there's an image in the message
2. Try **Shift+Click** on "Copy Item" to force viewer capture
3. Check if image is loaded (not broken)

### Buyer Not Found

1. Make sure the message contains a name or phone number
2. Check if the message format is recognized
3. Try manually copying the buyer name

## Configuration

### Enable Debug Logging

Edit the script and change line 19:
```javascript
const LOG = true;  // Change from false to true
```

Then open browser console (F12) to see debug messages.

### Change Button Colors

Edit the `makeButton` function calls:
- **Copy Buyer**: Line 653 - Change `'#4caf50'` (green)
- **Copy Item**: Line 667 - Change `'#1b6efd'` (blue)

## Technical Details

### How It Works

1. **MutationObserver**: Watches for new messages and attaches buttons
2. **DOM Traversal**: Finds message bubbles and associated images
3. **Image Resolution**: Resolves best image source (srcset, data attributes, etc.)
4. **Viewer Capture**: Safely captures high-resolution images from WhatsApp viewer
5. **Cloudinary Upload**: Uploads images using unsigned upload preset
6. **Data Extraction**: Extracts buyer name/phone and price from message bubbles

### Browser Compatibility

- ✅ Chrome/Edge (recommended)
- ✅ Firefox
- ✅ Safari (may have limitations)
- ❌ Internet Explorer (not supported)

## Security

- **No API Keys Required**: Uses unsigned upload presets (safe for client-side)
- **No Data Collection**: Script doesn't collect or store any data
- **Local Execution**: All processing happens in your browser
- **Open Source**: Code is visible and auditable

## Updates

- **Version 2.8.1**: Fixed image variable bug, simplified upload function
- **Version 2.8**: Added safe viewer capture, improved error handling

## Support

If you encounter issues:
1. Check browser console (F12) for errors
2. Verify Cloudinary credentials
3. Check Tampermonkey is enabled
4. Try refreshing WhatsApp Web

## License

This script is provided as-is for personal use.


