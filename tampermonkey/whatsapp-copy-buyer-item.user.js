// ==UserScript==
// @name         WhatsApp: Copy Buyer (right) + Copy Item (left) - safe viewer capture (daye1yfzy/bh_smry_upload)
// @namespace    http://tampermonkey.net/
// @version      3.3.0
// @description  Copy Buyer on right, Copy Item on left, Crop Item. Uploads images to Cloudinary and copies payload (buyer/imageUrl/price) to clipboard. Added crop functionality to crop images before uploading.
// @match        https://web.whatsapp.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setClipboard
// @grant        GM_notification
// @connect      api.cloudinary.com
// ==/UserScript==

(function () {
  'use strict';

  // config
  const CLOUD_NAME = 'daye1yfzy';
  const UPLOAD_PRESET = 'bh_smry_upload';
  const LOG = false; // set false to silence console logs

  let lastBuyer = '';
  function log(...args) { if (LOG) console.log('[WA-CopyUploader]', ...args); }

  // button factory
  function makeButton(text, color = '#1b6efd') {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    Object.assign(b.style, {
      position: 'absolute',
      top: '6px',
      padding: '4px 8px',
      background: color,
      color: '#fff',
      border: 'none',
      borderRadius: '6px',
      cursor: 'pointer',
      fontSize: '12px',
      boxShadow: '0 4px 10px rgba(0,0,0,0.12)',
      zIndex: 9999999,
      visibility: 'hidden',
      opacity: 0,
      transition: 'opacity 120ms ease'
    });
    return b;
  }

  // find text bubbles in WA Web
  function getTextBubbles() {
    try {
      const spans = Array.from(document.querySelectorAll('[data-pre-plain-text]'));
      const bubbles = new Set();
      for (const s of spans) {
        let el = s;
        for (let i = 0; i < 6 && el; i++, el = el.parentElement) {
          if (!el) break;
          if (el.querySelector && el.querySelector('[data-pre-plain-text]')) { bubbles.add(el); break; }
        }
      }
      return Array.from(bubbles);
    } catch (e) { console.error(e); return []; }
  }

  // find image bubbles - exclude profile pictures and include sent/received message images
  function getImageBubbles() {
    try {
      const imgs = Array.from(document.querySelectorAll('img'));
      const set = new Set();
      
      for (const img of imgs) {
        try {
          // Get image dimensions
          const rect = img.getBoundingClientRect();
          const width = rect.width || img.offsetWidth || img.naturalWidth || 0;
          const height = rect.height || img.offsetHeight || img.naturalHeight || 0;
          
          // Skip if image is too small (profile pictures are usually < 70px)
          if (width < 70 || height < 70) {
            continue;
          }
          
          // Check if image is circular (profile pictures are usually circular)
          const computedStyle = window.getComputedStyle(img);
          const borderRadius = computedStyle.borderRadius;
          const isCircular = borderRadius && (
            borderRadius.includes('50%') || 
            borderRadius.includes('999px') || 
            borderRadius.includes('9999px')
          );
          
          // Skip small circular images (likely profile pictures) - but allow larger circular images
          if (isCircular && width < 120 && height < 120) {
            continue;
          }
          
          // Walk up the DOM tree to find message container and check location
          let el = img;
          let foundMsgAncestor = null;
          let isInMessageArea = false;
          let isInHeaderOrSidebar = false;
          
          // Check all ancestors
          for (let i = 0; i < 25 && el; i++, el = el.parentElement) {
            if (!el) break;
            
            const className = (el.className || '').toString();
            const role = el.getAttribute && el.getAttribute('role');
            const id = (el.id || '').toString();
            const tagName = el.tagName ? el.tagName.toLowerCase() : '';
            
            // Skip if clearly in header, sidebar, or navigation areas
            if (role === 'banner' || 
                role === 'navigation' || 
                role === 'complementary' ||
                className.includes('header') ||
                className.includes('sidebar') ||
                className.includes('navigation') ||
                id.includes('header') ||
                id.includes('sidebar')) {
              isInHeaderOrSidebar = true;
              break;
            }
            
            // Check if this is in the main scrollable message area
            // Look for scrollable containers that are likely the message list
            const hasOverflow = window.getComputedStyle(el).overflowY === 'auto' || 
                                window.getComputedStyle(el).overflowY === 'scroll';
            const isScrollable = hasOverflow && (el.scrollHeight > el.clientHeight);
            
            // Check for message indicators (received messages have data-pre-plain-text)
            const hasDataPrePlainText = el.querySelector && el.querySelector('[data-pre-plain-text]');
            
            // Check for message-like containers (sent or received)
            // WhatsApp message bubbles often have these indicators:
            const looksLikeMessage = hasDataPrePlainText ||
                                   className.includes('message') ||
                                   className.includes('msg') ||
                                   className.includes('bubble') ||
                                   className.includes('selectable') ||
                                   className.includes('copyable') ||
                                   el.getAttribute('data-id') ||
                                   (el.getAttribute('aria-label') && 
                                    (el.getAttribute('aria-label').includes('image') || 
                                     el.getAttribute('aria-label').includes('photo'))) ||
                                   // Check if parent is scrollable (message list area)
                                   isScrollable ||
                                   // Check if we're deep enough in the DOM (likely in message area)
                                   i > 5;
            
            // If it looks like a message container and we're not in header/sidebar
            if (looksLikeMessage && !isInHeaderOrSidebar) {
              // Verify we're in the main chat area by checking parent hierarchy
              let parent = el.parentElement;
              let foundMainArea = false;
              
              // Check up to 10 levels up for main chat area indicators
              for (let j = 0; j < 10 && parent; j++, parent = parent.parentElement) {
                if (!parent) break;
                
                const parentClass = (parent.className || '').toString();
                const parentId = (parent.id || '').toString();
                const parentRole = parent.getAttribute && parent.getAttribute('role');
                const parentStyle = window.getComputedStyle(parent);
                
                // If we hit header/sidebar, skip
                if (parentRole === 'banner' || 
                    parentRole === 'navigation' || 
                    parentClass.includes('header') || 
                    parentClass.includes('sidebar')) {
                  break;
                }
                
                // Check if we're in main chat area (scrollable, has message indicators, or main container)
                if (parentClass.includes('main') ||
                    parentClass.includes('message') ||
                    parentClass.includes('chat') ||
                    parentClass.includes('conversation') ||
                    parentId.includes('main') ||
                    parentId.includes('message') ||
                    parentId.includes('chat') ||
                    (parentStyle.overflowY === 'auto' || parentStyle.overflowY === 'scroll')) {
                  foundMainArea = true;
                  break;
                }
              }
              
              // If we found a message-like container and we're likely in the main area (or deep enough in DOM)
              // and not in header/sidebar, consider it a message image
              if (foundMainArea || (looksLikeMessage && i > 8 && !isInHeaderOrSidebar)) {
                foundMsgAncestor = el;
                isInMessageArea = true;
                break;
              }
            }
          }
          
          // If we didn't find a message ancestor but the image is large and not in header/sidebar,
          // and it's in a scrollable area (message list), include it anyway
          if (!foundMsgAncestor && !isInHeaderOrSidebar && width >= 100 && height >= 100 && !isCircular) {
            // Check if image is in scrollable message area
            let checkEl = img;
            for (let i = 0; i < 15 && checkEl; i++, checkEl = checkEl.parentElement) {
              if (!checkEl) break;
              const style = window.getComputedStyle(checkEl);
              if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && 
                  checkEl.scrollHeight > checkEl.clientHeight) {
                // Found scrollable container - likely message list
                foundMsgAncestor = img.closest('div') || img.parentElement;
                isInMessageArea = true;
                break;
              }
            }
          }
          
          // Add if we found a message ancestor or if it's a large image in message area
          if (foundMsgAncestor && isInMessageArea && !isInHeaderOrSidebar) {
            set.add(foundMsgAncestor);
          }
        } catch (e) {
          log('Error processing image:', e);
          continue;
        }
      }
      
      return Array.from(set);
    } catch (e) { 
      log('getImageBubbles error', e);
      return []; 
    }
  }

  // buyer extraction
  function stripTimeDate(raw) {
    if (!raw) return '';
    let s = raw;
    s = s.replace(/\b\d{1,2}[:.]\d{2}\s*(?:[APMapm]{2})?(?:\s*,\s*\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})?/g, ' ');
    s = s.replace(/\b\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}\b/g, ' ');
    s = s.replace(/\b(?:AM|PM|am|pm|gmt|ist)\b/g, ' ');
    s = s.replace(/[:,]\s*$/, ' ').trim();
    return s.trim();
  }

  function extractBuyerNameOrNumber(bubble) {
    try {
      const spanCandidates = bubble.querySelectorAll('span, a');
      for (const sp of spanCandidates) {
        const txt = (sp.innerText || '').trim();
        if (!txt) continue;
        if (/\b\d{1,2}[:.]\d{2}\b/.test(txt)) continue;
        if (sp.tagName.toLowerCase() === 'a' && (sp.getAttribute('href') || '').startsWith('tel:')) {
          const digits = (sp.getAttribute('href') || '').replace(/\D/g, '');
          if (digits.length > 10) return digits.slice(-10);
          return digits;
        }
        const phoneMatch = txt.match(/(\+?\d[\d\s-]{7,}\d)/);
        if (phoneMatch) {
          let digits = phoneMatch[1].replace(/\D/g, '');
          if (digits.length > 10) digits = digits.slice(-10);
          if (digits) return digits;
        }
      }

      for (const sp of spanCandidates) {
        const txt = (sp.innerText || '').trim();
        if (!txt) continue;
        if (/\+?\d/.test(txt)) continue;
        if (/[A-Za-z]/.test(txt) && txt.length <= 60) return txt;
      }

      const pre = bubble.querySelector('[data-pre-plain-text]');
      if (pre) {
        let raw = pre.getAttribute('data-pre-plain-text') || pre.innerText || '';
        raw = stripTimeDate(raw);
        const br = raw.match(/^\[([^\]]+)\]/);
        if (br && br[1]) return br[1].trim();
        const phoneMatch = raw.match(/(\+?\d[\d\s-]{7,}\d)/);
        if (phoneMatch) {
          let digits = phoneMatch[1].replace(/\D/g, '');
          if (digits.length > 10) digits = digits.slice(-10);
          if (digits) return digits;
        }
        const left = raw.split(':')[0].trim();
        if (left && /[A-Za-z]/.test(left)) return left;
      }

      const header = document.querySelector('header');
      if (header) {
        let ht = header.innerText || '';
        ht = stripTimeDate(ht);
        const first = ht.split('\n')[0].trim();
        if (first && /[A-Za-z]/.test(first)) return first;
        const pm = ht.match(/(\+?\d[\d\s-]{7,}\d)/);
        if (pm) { let d = pm[1].replace(/\D/g, ''); if (d.length > 10) d = d.slice(-10); return d; }
      }

      const lines = (bubble.innerText || '').split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length) return lines[0];
      return '';
    } catch (e) {
      log('extractBuyer error', e);
      return '';
    }
  }

  // find associated image for text bubble
  function findImageBubbleForTextBubble(bubble) {
    try {
      const pres = Array.from(document.querySelectorAll('[data-pre-plain-text]'));
      const bubbles = pres.map(s => {
        let el = s;
        for (let i = 0; i < 6 && el; i++, el = el.parentElement) {
          if (!el) break;
          if (el.querySelector && el.querySelector('[data-pre-plain-text]')) break;
        }
        return el;
      }).filter(Boolean);

      const idx = bubbles.indexOf(bubble);
      const start = idx >= 0 ? idx - 1 : bubbles.length - 1;
      for (let i = start; i >= 0; i--) {
        const cand = bubbles[i];
        if (!cand) continue;
        const imgs = cand.querySelectorAll('img');
        if (imgs.length) return { imageEl: imgs[0], imageBubble: cand };
      }

      const allImgs = Array.from(document.querySelectorAll('img'));
      if (!allImgs.length) return null;
      const rect = bubble.getBoundingClientRect();
      let candidate = null;
      for (const im of allImgs) {
        const r = im.getBoundingClientRect();
        if (r.top < rect.top) candidate = im;
      }
      if (candidate) {
        let p = candidate;
        for (let i = 0; i < 8 && p; i++, p = p.parentElement) {
          if (!p) break;
          if (p.querySelector && p.querySelector('[data-pre-plain-text]')) return { imageEl: candidate, imageBubble: p };
        }
      }
      return null;
    } catch (e) { log('findImageBubbleForTextBubble err', e); return null; }
  }

  // price extraction
  function extractPriceFromImageBubble(imageBubble, imgEl) {
    try {
      if (!imageBubble) return '';
      const elems = Array.from(imageBubble.querySelectorAll('*'));
      function proximityScore(node) {
        try {
          const nr = node.getBoundingClientRect();
          const ir = imgEl.getBoundingClientRect();
          return Math.abs(nr.top - ir.top) + Math.abs(nr.left - ir.left);
        } catch (e) { return 1e6; }
      }
      const candidates = elems.map(n => ({ node: n, text: (n.innerText || '').trim(), score: proximityScore(n) }))
        .filter(c => c.text && c.text.length > 0)
        .sort((a, b) => a.score - b.score);

      for (const c of candidates) {
        const text = c.text;
        if (text.indexOf(':') !== -1) continue; // skip times
        const toks = text.match(/\b(\d{3,6})\b/g);
        if (toks && toks.length) return toks[0];
      }
      for (const c of candidates) {
        const text = c.text;
        if (text.indexOf(':') !== -1) continue;
        const toks = text.match(/\b(\d{2,6})\b/g);
        if (toks && toks.length) return toks[0];
      }

      let nearby = (imageBubble.innerText || '').replace(/\u00A0/g, ' ');
      nearby = nearby.replace(/\b\d{1,2}[:.]\d{2}\s*(?:[APMapm]{2})?(?:\s*,\s*\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})?/g, ' ');
      nearby = nearby.replace(/\b\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}\b/g, ' ');
      nearby = nearby.replace(/[₹Rs,]/gi, ' ');
      const m = nearby.match(/\b(\d{2,6})\b/);
      if (m) return m[1];
      return '';
    } catch (e) { log('extractPrice err', e); return ''; }
  }

  // Very thorough source resolver — returns: Blob | URL string | null
  async function resolveBestSource(imgEl, options = { allowViewer: false }) {
    if (!imgEl) return null;
    log('Resolve best source for image', imgEl);

    // 1. picture/source/srcset => largest entry
    try {
      const picture = imgEl.closest('picture');
      if (picture) {
        const sources = Array.from(picture.querySelectorAll('source'));
        const candidates = [];
        for (const s of sources) {
          const srcset = s.getAttribute('srcset');
          if (!srcset) continue;
          srcset.split(',').map(p => p.trim()).forEach(part => {
            const [url, token] = part.split(/\s+/);
            const w = token && token.endsWith('w') ? parseInt(token.slice(0, -1), 10) : 0;
            candidates.push({ url, w });
          });
        }
        if (candidates.length) {
          candidates.sort((a, b) => b.w - a.w);
          log('Picked picture/source candidate', candidates[0]);
          return candidates[0].url;
        }
      }

      const srcset = imgEl.getAttribute('srcset');
      if (srcset) {
        const parts = srcset.split(',').map(p => p.trim()).map(s => {
          const [url, token] = s.split(/\s+/);
          const w = token && token.endsWith('w') ? parseInt(token.slice(0, -1), 10) : 0;
          return { url, w };
        }).sort((a, b) => b.w - a.w);
        if (parts.length) { log('Chosen srcset candidate', parts[0]); return parts[0].url; }
      }
    } catch (e) { log('srcset/picture parse error', e); }

    // 2. common data-* attributes
    const tryAttrs = ['data-download-url', 'data-original', 'data-src', 'data-file', 'data-preview', 'data-plain-src', 'data-enc', 'data-ref', 'data-thumbnail', 'data-download', 'data-media'];
    for (const a of tryAttrs) {
      try {
        const v = imgEl.getAttribute(a) || (imgEl.dataset && imgEl.dataset[a.replace('data-', '')]);
        if (v) { log('Found data-* attr', a, v); return v; }
      } catch (e) {}
    }

    // 3. check parent anchor href (download links or direct media links)
    try {
      let parent = imgEl.parentElement;
      for (let i = 0; i < 6 && parent; i++, parent = parent.parentElement) {
        if (!parent) break;
        if (parent.tagName && parent.tagName.toLowerCase() === 'a') {
          const href = parent.getAttribute('href');
          if (href) {
            // prefer http(s) or blob or data
            if (/^https?:\/\//i.test(href) || href.startsWith('blob:') || href.startsWith('data:')) {
              log('Found parent anchor href', href);
              return href;
            }
          }
        }
      }
    } catch (e) {}

    // 4. inline style background-image on ancestor
    try {
      let ancestor = imgEl;
      for (let i = 0; i < 6 && ancestor; i++, ancestor = ancestor.parentElement) {
        if (!ancestor) break;
        const bg = window.getComputedStyle(ancestor).getPropertyValue('background-image');
        if (bg && bg !== 'none') {
          const m = bg.match(/url\(["']?(.*?)["']?\)/);
          if (m && m[1]) { log('Found background-image', m[1]); return m[1]; }
        }
      }
    } catch (e) {}

    // 5. try to transform the img.src to bigger variants (remove sizing tokens)
    try {
      const src = imgEl.src || '';
      if (src) {
        // remove s### segments
        const mod1 = src.replace(/\/s\d+\//g, '/s0/').replace(/\/s\d+(?=\/|$)/g, '/s0');
        if (mod1 !== src) { log('Transformed src (s###) =>', mod1); return mod1; }
        // remove query width/size params
        const mod2 = src.replace(/([?&](w|width|s|sz)=)\d+/gi, '').split('?')[0];
        if (mod2 && mod2 !== src) { log('Transformed src (remove params) =>', mod2); return mod2; }
        // replace w_ or h_ tokens (Cloudinary-like) if present (try w_0 or remove)
        const mod3 = src.replace(/w_\d+/g, 'w_0').replace(/h_\d+/g, 'h_0');
        if (mod3 !== src) { log('Transformed src (w_/h_) =>', mod3); return mod3; }
      }
    } catch (e) {}

    // 6. if src is blob: attempt fetch(blobUrl) to get actual blob (this is same-origin and non-invasive)
    try {
      const s = imgEl.src || '';
      if (s && s.startsWith('blob:')) {
        try {
          const r = await fetch(s);
          if (r.ok) {
            const blob = await r.blob();
            log('Fetched blob URL directly (no click). Size bytes:', blob.size);
            return blob; // return blob directly
          }
        } catch (e) { log('blob fetch failed', e); }
      }
    } catch (e) {}

    // 7. Search for larger image in surrounding DOM (viewer thumbnails, siblings, etc)
    try {
      // look for image elements in ancestors/descendants of message container that are notably larger
      const container = imgEl.closest('[data-pre-plain-text]') || imgEl.parentElement;
      if (container) {
        const imgs = Array.from(container.querySelectorAll('img')).filter(i => i !== imgEl);
        imgs.sort((a, b) => (b.naturalWidth * b.naturalHeight) - (a.naturalWidth * a.naturalHeight));
        if (imgs.length && imgs[0].naturalWidth * imgs[0].naturalHeight > (imgEl.naturalWidth * imgEl.naturalHeight)) {
          log('Found larger sibling image', imgs[0]);
          return imgs[0].src || imgs[0].getAttribute('data-src') || null;
        }
      }
    } catch (e) {}

    // 8. final fallback: return img.src (might be thumbnail)
    try {
      const last = imgEl.src || null;
      log('Fallback to image src', last);
      return last;
    } catch (e) { return null; }
  }

  // download URL to blob using GM_xmlhttpRequest
  function gmDownloadToBlob(url) {
    return new Promise((resolve, reject) => {
      try {
        GM_xmlhttpRequest({
          method: 'GET',
          url,
          responseType: 'arraybuffer',
          onload(resp) {
            try {
              const b = new Blob([resp.response]);
              resolve(b);
            } catch (e) { reject(e); }
          },
          onerror(err) { reject(new Error('Download error: ' + (err && err.message || err))); },
          ontimeout() { reject(new Error('Timeout while downloading')); }
        });
      } catch (e) { reject(e); }
    });
  }

  // upload blob/url to Cloudinary using GM_xmlhttpRequest
  function uploadToCloudinary(blobOrUrlOrFile, filename = 'image.jpg') {
    return new Promise(async (resolve, reject) => {
      try {
        let fileToSend;
        if (typeof blobOrUrlOrFile === 'string') {
          if (blobOrUrlOrFile.startsWith('data:')) {
            const res = await fetch(blobOrUrlOrFile);
            const blob = await res.blob();
            fileToSend = new File([blob], filename, { type: blob.type || 'image/jpeg' });
          } else {
            const blob = await gmDownloadToBlob(blobOrUrlOrFile);
            fileToSend = new File([blob], filename, { type: blob.type || 'image/jpeg' });
          }
        } else if (blobOrUrlOrFile instanceof Blob) {
          fileToSend = new File([blobOrUrlOrFile], filename, { type: blobOrUrlOrFile.type || 'image/jpeg' });
        } else {
          reject(new Error('Unsupported image source for upload'));
          return;
        }

        const form = new FormData();
        form.append('file', fileToSend);
        form.append('upload_preset', UPLOAD_PRESET);

        const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;
        GM_xmlhttpRequest({
          method: 'POST',
          url,
          data: form,
          onload(res) {
            try {
              if (res.status >= 200 && res.status < 300) {
                const json = JSON.parse(res.responseText);
                resolve(json);
              } else {
                reject(new Error(`Upload failed: ${res.status} ${res.statusText} ${res.responseText || ''}`));
              }
            } catch (e) { reject(e); }
          },
          onerror(err) { reject(new Error('Upload error: ' + (err && err.message || err))); },
          ontimeout() { reject(new Error('Timeout while uploading')); }
        });

      } catch (e) { reject(e); }
    });
  }

  // Explicit viewer-capture (only when user holds Shift) — opens viewer, waits for big image, captures blob, closes viewer.
  // This is opt-in and used only when allowViewer true.
  async function captureFromViewer(imgEl, timeoutMs = 2200) {
    try {
      // attempt to open viewer by simulating click on the clickable element around image (if it exists)
      // find clickable ancestor (role=button or tag button or anchor)
      let clickable = imgEl;
      for (let i = 0; i < 6 && clickable; i++, clickable = clickable.parentElement) {
        if (!clickable) break;
        const role = clickable.getAttribute && clickable.getAttribute('role');
        if ((role && role.toLowerCase() === 'button') || clickable.tagName.toLowerCase() === 'button' || clickable.tagName.toLowerCase() === 'a') break;
      }
      if (!clickable) clickable = imgEl;

      // attempt click
      try { clickable.click(); } catch (e) { log('Viewer click failed', e); }

      // wait for a visible image larger than threshold (poll)
      const start = Date.now();
      const found = await new Promise((resolve) => {
        const iv = setInterval(() => {
          const imgs = Array.from(document.querySelectorAll('img')).filter(i => {
            const r = i.getBoundingClientRect();
            return r.width > 200 && r.height > 200;
          });
          if (imgs.length) {
            clearInterval(iv);
            resolve(imgs[0]);
            return;
          }
          if (Date.now() - start > timeoutMs) { clearInterval(iv); resolve(null); }
        }, 120);
      });

      if (!found) {
        // try to close any possible viewer safely
        try { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); } catch (e) {}
        throw new Error('Viewer image not found within timeout');
      }

      // fetch blob of found image
      const src = found.src || '';
      if (!src) {
        // close viewer
        try { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); } catch (e) {}
        throw new Error('Viewer image has no src');
      }

      let blob = null;
      if (src.startsWith('blob:')) {
        const r = await fetch(src);
        if (r.ok) blob = await r.blob();
      } else {
        blob = await gmDownloadToBlob(src);
      }

      // close viewer
      try { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); } catch (e) {}

      if (!blob) throw new Error('Failed to download viewer image');
      log('Captured blob from viewer, size', blob.size);
      return blob;
    } catch (e) {
      log('captureFromViewer error', e);
      // ensure viewer closed
      try { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); } catch (e) {}
      throw e;
    }
  }

  // derive filename
  function filenameFromSrc(s) {
    try {
      if (typeof s !== 'string') return 'image.jpg';
      const url = new URL(s, location.href);
      const last = url.pathname.split('/').filter(Boolean).pop() || 'image';
      return decodeURIComponent((last.split('?')[0])) || 'image.jpg';
    } catch (e) { return 'image.jpg'; }
  }

  // show crop modal and handle cropping
  async function showCropModal(imageSource, imageBubble, imgEl, btn, isFromTextBubble) {
    return new Promise((resolve) => {
      // Create modal overlay
      const overlay = document.createElement('div');
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.9);
        z-index: 99999999;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        box-sizing: border-box;
      `;

      // Create modal content
      const modal = document.createElement('div');
      modal.style.cssText = `
        background: white;
        border-radius: 12px;
        padding: 20px;
        max-width: 90vw;
        max-height: 90vh;
        display: flex;
        flex-direction: column;
        box-shadow: 0 10px 40px rgba(0,0,0,0.3);
      `;

      // Create header
      const header = document.createElement('div');
      header.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 15px;
      `;
      const title = document.createElement('h3');
      title.textContent = 'Crop Image';
      title.style.cssText = 'margin: 0; font-size: 18px; font-weight: 600;';
      const closeBtn = document.createElement('button');
      closeBtn.textContent = '✕';
      closeBtn.style.cssText = `
        background: #f0f0f0;
        border: none;
        width: 30px;
        height: 30px;
        border-radius: 50%;
        cursor: pointer;
        font-size: 18px;
        display: flex;
        align-items: center;
        justify-content: center;
      `;
      closeBtn.onclick = () => {
        document.body.removeChild(overlay);
        btn.disabled = false;
        btn.textContent = '✂️ Crop';
        resolve(null);
      };
      header.appendChild(title);
      header.appendChild(closeBtn);

      // Create image container
      const imgContainer = document.createElement('div');
      imgContainer.style.cssText = `
        position: relative;
        max-width: 80vw;
        max-height: 70vh;
        overflow: auto;
        border: 2px solid #ddd;
        border-radius: 8px;
        background: #f5f5f5;
        display: flex;
        align-items: center;
        justify-content: center;
      `;

      // Create canvas for cropping
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      let cropRect = null;
      
      // Load image
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      img.onload = () => {
        // Set canvas size to fit viewport
        const maxWidth = Math.min(800, window.innerWidth - 100);
        const maxHeight = Math.min(600, window.innerHeight - 200);
        const scale = Math.min(maxWidth / img.width, maxHeight / img.height, 1);
        
        const displayWidth = img.width * scale;
        const displayHeight = img.height * scale;
        
        canvas.width = img.width;
        canvas.height = img.height;
        canvas.style.width = displayWidth + 'px';
        canvas.style.height = displayHeight + 'px';
        canvas.style.display = 'block';
        canvas.style.cursor = 'crosshair';
        
        // Draw image on canvas
        ctx.drawImage(img, 0, 0);
        
        // Crop selection state
        let isSelecting = false;
        let startX = 0;
        let startY = 0;
        let endX = 0;
        let endY = 0;
        
        // Draw crop overlay
        function drawCropOverlay() {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);
          
          if (cropRect) {
            const { x, y, width, height } = cropRect;
            // Draw semi-transparent overlay
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            // Clear the crop area
            ctx.clearRect(x, y, width, height);
            ctx.drawImage(img, x, y, width, height, x, y, width, height);
            
            // Draw crop border
            ctx.strokeStyle = '#4caf50';
            ctx.lineWidth = 3;
            ctx.setLineDash([]);
            ctx.strokeRect(x, y, width, height);
            
            // Draw corner handles
            const handleSize = 12;
            ctx.fillStyle = '#4caf50';
            ctx.fillRect(x - handleSize/2, y - handleSize/2, handleSize, handleSize);
            ctx.fillRect(x + width - handleSize/2, y - handleSize/2, handleSize, handleSize);
            ctx.fillRect(x - handleSize/2, y + height - handleSize/2, handleSize, handleSize);
            ctx.fillRect(x + width - handleSize/2, y + height - handleSize/2, handleSize, handleSize);
          }
        }
        
        // Get mouse position relative to canvas (in image coordinates)
        function getMousePos(e) {
          const rect = canvas.getBoundingClientRect();
          const scaleX = canvas.width / rect.width;
          const scaleY = canvas.height / rect.height;
          return {
            x: Math.max(0, Math.min(canvas.width, (e.clientX - rect.left) * scaleX)),
            y: Math.max(0, Math.min(canvas.height, (e.clientY - rect.top) * scaleY))
          };
        }
        
        // Mouse down - start selection
        canvas.addEventListener('mousedown', (e) => {
          isSelecting = true;
          const pos = getMousePos(e);
          startX = pos.x;
          startY = pos.y;
          cropRect = null;
        });
        
        // Mouse move - update selection
        canvas.addEventListener('mousemove', (e) => {
          if (isSelecting) {
            const pos = getMousePos(e);
            endX = pos.x;
            endY = pos.y;
            
            cropRect = {
              x: Math.max(0, Math.min(startX, endX)),
              y: Math.max(0, Math.min(startY, endY)),
              width: Math.max(10, Math.abs(endX - startX)),
              height: Math.max(10, Math.abs(endY - startY))
            };
            
            // Ensure crop rect doesn't go outside image
            if (cropRect.x + cropRect.width > canvas.width) {
              cropRect.width = canvas.width - cropRect.x;
            }
            if (cropRect.y + cropRect.height > canvas.height) {
              cropRect.height = canvas.height - cropRect.y;
            }
            
            drawCropOverlay();
          }
        });
        
        // Mouse up - end selection
        canvas.addEventListener('mouseup', () => {
          isSelecting = false;
        });
        
        // Initial draw
        drawCropOverlay();
      };
      
      img.onerror = () => {
        alert('Failed to load image');
        document.body.removeChild(overlay);
        btn.disabled = false;
        btn.textContent = '✂️ Crop';
        resolve(null);
      };
      
      // Handle different image source types
      if (imageSource instanceof Blob) {
        img.src = URL.createObjectURL(imageSource);
      } else if (typeof imageSource === 'string') {
        if (imageSource.startsWith('blob:') || imageSource.startsWith('data:')) {
          img.src = imageSource;
        } else {
          // For external URLs, download first
          gmDownloadToBlob(imageSource).then(blob => {
            img.src = URL.createObjectURL(blob);
          }).catch(err => {
            alert('Failed to load image: ' + err.message);
            document.body.removeChild(overlay);
            btn.disabled = false;
            btn.textContent = '✂️ Crop';
            resolve(null);
          });
          return;
        }
      } else {
        alert('Invalid image source');
        document.body.removeChild(overlay);
        btn.disabled = false;
        btn.textContent = '✂️ Crop';
        resolve(null);
        return;
      }
      
      imgContainer.appendChild(canvas);
      
      // Create instructions
      const instructions = document.createElement('div');
      instructions.textContent = 'Click and drag to select the area you want to crop';
      instructions.style.cssText = `
        margin-bottom: 10px;
        color: #666;
        font-size: 14px;
        text-align: center;
      `;
      
      // Create buttons
      const buttons = document.createElement('div');
      buttons.style.cssText = `
        display: flex;
        gap: 10px;
        margin-top: 15px;
        justify-content: flex-end;
      `;
      
      const cancelBtn = document.createElement('button');
      cancelBtn.textContent = 'Cancel';
      cancelBtn.style.cssText = `
        padding: 10px 20px;
        background: #f0f0f0;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
      `;
      cancelBtn.onclick = () => {
        document.body.removeChild(overlay);
        btn.disabled = false;
        btn.textContent = '✂️ Crop';
        resolve(null);
      };
      
      const cropBtn = document.createElement('button');
      cropBtn.textContent = 'Crop & Upload';
      cropBtn.style.cssText = `
        padding: 10px 20px;
        background: #4caf50;
        color: white;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 600;
      `;
      cropBtn.onclick = async () => {
        if (!cropRect || cropRect.width < 10 || cropRect.height < 10) {
          alert('Please select an area to crop by clicking and dragging on the image');
          return;
        }
        
        cropBtn.disabled = true;
        cropBtn.textContent = 'Cropping...';
        
        try {
          // Create cropped canvas
          const croppedCanvas = document.createElement('canvas');
          croppedCanvas.width = cropRect.width;
          croppedCanvas.height = cropRect.height;
          const croppedCtx = croppedCanvas.getContext('2d');
          
          // Draw cropped portion from original image
          croppedCtx.drawImage(
            img,
            cropRect.x, cropRect.y, cropRect.width, cropRect.height,
            0, 0, cropRect.width, cropRect.height
          );
          
          // Convert to blob
          croppedCanvas.toBlob(async (blob) => {
            if (!blob) {
              alert('Failed to crop image');
              cropBtn.disabled = false;
              cropBtn.textContent = 'Crop & Upload';
              return;
            }
            
            document.body.removeChild(overlay);
            
            // Upload cropped image
            btn.disabled = true;
            btn.textContent = '⤓ Uploading cropped image...';
            
            try {
              const uploadResult = await uploadToCloudinary(blob, filenameFromSrc(imgEl.src || 'image.jpg'));
              const secure = (uploadResult && (uploadResult.secure_url || uploadResult.url));
              if (!secure) throw new Error('Cloudinary returned no URL');
              
              const price = extractPriceFromImageBubble(imageBubble, imgEl) || '';
              const payload = `${lastBuyer || ''}\n${secure}\n${price}`;
              
              try { GM_setClipboard(payload); } catch (e) { log('clipboard fail', e); }
              GM_notification({ title: 'Cropped & Copied', text: (lastBuyer || '(no buyer)'), timeout: 3000 });
              
              btn.textContent = '✔ Done';
              setTimeout(() => { btn.textContent = '✂️ Crop'; btn.disabled = false; }, 1500);
              
              resolve(secure);
            } catch (err) {
              console.error(err);
              GM_notification({ title: 'Upload failed', text: String(err.message || err), timeout: 5000 });
              btn.textContent = '❌';
              setTimeout(() => { btn.textContent = '✂️ Crop'; btn.disabled = false; }, 1400);
              resolve(null);
            }
          }, 'image/jpeg', 0.95);
        } catch (err) {
          console.error(err);
          alert('Failed to crop image: ' + err.message);
          cropBtn.disabled = false;
          cropBtn.textContent = 'Crop & Upload';
        }
      };
      
      buttons.appendChild(cancelBtn);
      buttons.appendChild(cropBtn);
      
      modal.appendChild(header);
      modal.appendChild(instructions);
      modal.appendChild(imgContainer);
      modal.appendChild(buttons);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);
    });
  }

  // handle crop item from text bubble
  async function handleCropItemFromTextBubble(textBubble, btn, ev) {
    try {
      btn.disabled = true;
      btn.textContent = '⤓ Finding image...';

      const imgResult = findImageBubbleForTextBubble(textBubble);
      if (!imgResult || !imgResult.imageEl) {
        GM_notification({ title: 'Image not found', text: 'Could not locate the tagged image', timeout: 2500 });
        btn.textContent = '✂️ Crop';
        btn.disabled = false;
        return;
      }

      const imgEl = imgResult.imageEl;
      const imageBubble = imgResult.imageBubble;

      btn.textContent = '⤓ Resolving source...';
      let best = await resolveBestSource(imgEl, { allowViewer: ev.shiftKey === true });

      // If user explicitly allowed viewer capture and best is still likely a thumbnail, attempt viewer capture:
      if (ev.shiftKey === true && !(best instanceof Blob)) {
        const thumbArea = (imgEl.naturalWidth || imgEl.width) * (imgEl.naturalHeight || imgEl.height);
        if (!thumbArea || thumbArea < 40000) {
          try {
            btn.textContent = '⤓ Capturing viewer...';
            const blob = await captureFromViewer(imgEl, 2200);
            if (blob) best = blob;
          } catch (e) {
            log('viewer capture failed or timed out', e);
          }
        }
      }

      // Convert URL to blob if needed
      if (typeof best === 'string' && !best.startsWith('data:') && !best.startsWith('blob:')) {
        btn.textContent = '⤓ Downloading image...';
        best = await gmDownloadToBlob(best);
      } else if (typeof best === 'string' && best.startsWith('blob:')) {
        const response = await fetch(best);
        best = await response.blob();
      }

      if (!(best instanceof Blob)) {
        throw new Error('Unable to resolve image source');
      }

      btn.textContent = '⤓ Opening crop editor...';
      await showCropModal(best, imageBubble, imgEl, btn, true);
    } catch (err) {
      console.error(err);
      GM_notification({ title: 'Error', text: String(err.message || err), timeout: 5000 });
      btn.textContent = '❌';
      setTimeout(() => { btn.textContent = '✂️ Crop'; btn.disabled = false; }, 1400);
    }
  }

  // handle crop item from image bubble
  async function handleCropItemFromImageBubble(imageBubble, btn, ev) {
    try {
      btn.disabled = true;
      btn.textContent = '⤓ Resolving image...';
      const imgEl = imageBubble.querySelector('img');
      if (!imgEl) {
        GM_notification({ title: 'No image', text: 'No image element found', timeout: 2000 });
        btn.textContent = '✂️ Crop';
        btn.disabled = false;
        return;
      }

      btn.textContent = '⤓ Resolving source...';
      let best = await resolveBestSource(imgEl, { allowViewer: ev.shiftKey === true });

      // If user explicitly allowed viewer capture and best is still likely a thumbnail, attempt viewer capture:
      if (ev.shiftKey === true && !(best instanceof Blob)) {
        const thumbArea = (imgEl.naturalWidth || imgEl.width) * (imgEl.naturalHeight || imgEl.height);
        if (!thumbArea || thumbArea < 40000) {
          try {
            btn.textContent = '⤓ Capturing viewer...';
            const blob = await captureFromViewer(imgEl, 2200);
            if (blob) best = blob;
          } catch (e) {
            log('viewer capture failed or timed out', e);
          }
        }
      }

      // Convert URL to blob if needed
      if (typeof best === 'string' && !best.startsWith('data:') && !best.startsWith('blob:')) {
        btn.textContent = '⤓ Downloading image...';
        best = await gmDownloadToBlob(best);
      } else if (typeof best === 'string' && best.startsWith('blob:')) {
        const response = await fetch(best);
        best = await response.blob();
      }

      if (!(best instanceof Blob)) {
        throw new Error('Unable to resolve image source');
      }

      btn.textContent = '⤓ Opening crop editor...';
      await showCropModal(best, imageBubble, imgEl, btn, false);
    } catch (err) {
      console.error(err);
      GM_notification({ title: 'Error', text: String(err.message || err), timeout: 5000 });
      btn.textContent = '❌';
      setTimeout(() => { btn.textContent = '✂️ Crop'; btn.disabled = false; }, 1400);
    }
  }

  // handle copy buyer
  async function handleCopyBuyer(bubble, buyerBtn) {
    try {
      const buyer = extractBuyerNameOrNumber(bubble) || '';
      if (!buyer) {
        GM_notification({ title: 'Buyer not found', text: 'Could not find name or phone in that message', timeout: 2500 });
        buyerBtn.textContent = '❌';
        setTimeout(() => buyerBtn.textContent = 'Copy Buyer', 1200);
        return;
      }
      lastBuyer = buyer;
      try { GM_setClipboard(buyer); } catch (e) { try { navigator.clipboard.writeText(buyer); } catch (_) {} }
      GM_notification({ title: 'Copied buyer', text: buyer, timeout: 2000 });

      buyerBtn.style.visibility = 'hidden';
      buyerBtn.style.pointerEvents = 'none';
      buyerBtn.disabled = true;

      if (!bubble.dataset.copyItemInjected) {
        bubble.dataset.copyItemInjected = '1';
        const itemBtn = makeButton('Copy Item', '#1b6efd');
        itemBtn.style.left = '6px';
        itemBtn.style.right = 'auto';
        const cropBtn = makeButton('✂️ Crop', '#ff9800');
        cropBtn.style.left = '70px';
        cropBtn.style.right = 'auto';
        bubble.appendChild(itemBtn);
        bubble.appendChild(cropBtn);
        let t;
        bubble.addEventListener('mouseenter', () => { 
          if (t) clearTimeout(t); 
          itemBtn.style.visibility = 'visible'; 
          itemBtn.style.opacity = '1';
          cropBtn.style.visibility = 'visible';
          cropBtn.style.opacity = '1';
        });
        bubble.addEventListener('mouseleave', () => { 
          t = setTimeout(() => { 
            itemBtn.style.opacity = '0'; 
            itemBtn.style.visibility = 'hidden';
            cropBtn.style.opacity = '0';
            cropBtn.style.visibility = 'hidden';
          }, 140); 
        });
        itemBtn.addEventListener('click', async (ev) => {
          ev.stopPropagation(); ev.preventDefault();
          await handleCopyItemFromTextBubble(bubble, itemBtn, ev);
          try {
            itemBtn.remove();
            cropBtn.remove();
            delete bubble.dataset.copyItemInjected;
            buyerBtn.disabled = false;
            buyerBtn.style.pointerEvents = 'auto';
            buyerBtn.style.visibility = 'visible';
            buyerBtn.style.opacity = 1;
            buyerBtn.textContent = 'Copy Buyer';
          } catch (e) {}
        });
        cropBtn.addEventListener('click', async (ev) => {
          ev.stopPropagation(); ev.preventDefault();
          await handleCropItemFromTextBubble(bubble, cropBtn, ev);
        });
      }
    } catch (e) {
      console.error(e);
      GM_notification({ title: 'Error', text: String(e), timeout: 3000 });
      buyerBtn.disabled = false;
      buyerBtn.textContent = 'Copy Buyer';
    }
  }

  // handle copy item from text bubble
  async function handleCopyItemFromTextBubble(textBubble, btn, ev) {
    try {
      btn.disabled = true;
      btn.textContent = '⤓ Finding image...';

      const imgResult = findImageBubbleForTextBubble(textBubble);
      if (!imgResult || !imgResult.imageEl) {
        GM_notification({ title: 'Image not found', text: 'Could not locate the tagged image', timeout: 2500 });
        btn.textContent = '❌';
        setTimeout(() => { btn.textContent = 'Copy Item'; btn.disabled = false; }, 1400);
        return;
      }

      const imgEl = imgResult.imageEl;
      const imageBubble = imgResult.imageBubble;

      btn.textContent = '⤓ Resolving source...';
      let best = await resolveBestSource(imgEl, { allowViewer: ev.shiftKey === true });

      // If user explicitly allowed viewer capture and best is still likely a thumbnail, attempt viewer capture:
      if (ev.shiftKey === true && !(best instanceof Blob)) {
        // if best looks same as thumbnail (small dimensions) attempt viewer capture
        const thumbArea = (imgEl.naturalWidth || imgEl.width) * (imgEl.naturalHeight || imgEl.height);
        if (!thumbArea || thumbArea < 40000) { // small thumbnail, prefer viewer capture
          try {
            btn.textContent = '⤓ Capturing viewer...';
            const blob = await captureFromViewer(imgEl, 2200);
            if (blob) best = blob;
          } catch (e) {
            log('viewer capture failed or timed out', e);
          }
        }
      }

      btn.textContent = '⤓ Uploading...';

      let uploadResult;
      if (best instanceof Blob) {
        uploadResult = await uploadToCloudinary(best, filenameFromSrc(imgEl.src || 'image.jpg'));
      } else if (typeof best === 'string') {
        uploadResult = await uploadToCloudinary(best, filenameFromSrc(best));
      } else {
        throw new Error('Unable to resolve image source');
      }

      const secure = (uploadResult && (uploadResult.secure_url || uploadResult.url));
      if (!secure) throw new Error('Cloudinary returned no URL');

      const price = extractPriceFromImageBubble(imageBubble, imgEl) || '';
      const payload = `${lastBuyer || ''}\n${secure}\n${price}`;

      try { GM_setClipboard(payload); } catch (e) { log('clipboard fail', e); }
      GM_notification({ title: 'Copied', text: (lastBuyer ? lastBuyer : '(no buyer)'), timeout: 3000 });

      btn.textContent = '✔ Done';
      setTimeout(() => { btn.textContent = 'Copy Item'; btn.disabled = false; }, 1500);
      log('Payload:', payload);
    } catch (err) {
      console.error(err);
      GM_notification({ title: 'Upload failed', text: String(err.message || err), timeout: 5000 });
      btn.textContent = '❌';
      setTimeout(() => { btn.textContent = 'Copy Item'; btn.disabled = false; }, 1400);
    }
  }

  // handle copy item from image bubble
  async function handleCopyItemFromImageBubble(imageBubble, btn, ev) {
    try {
      btn.disabled = true;
      btn.textContent = '⤓ Resolving image...';
      const imgEl = imageBubble.querySelector('img');
      if (!imgEl) {
        GM_notification({ title: 'No image', text: 'No image element found', timeout: 2000 });
        btn.textContent = 'Copy Item';
        btn.disabled = false;
        return;
      }

      let best = await resolveBestSource(imgEl, { allowViewer: ev.shiftKey === true });

      // If user explicitly allowed viewer capture and best is still likely a thumbnail, attempt viewer capture:
      if (ev.shiftKey === true && !(best instanceof Blob)) {
        const thumbArea = (imgEl.naturalWidth || imgEl.width) * (imgEl.naturalHeight || imgEl.height);
        if (!thumbArea || thumbArea < 40000) {
          try {
            btn.textContent = '⤓ Capturing viewer...';
            const blob = await captureFromViewer(imgEl, 2200);
            if (blob) best = blob;
          } catch (e) {
            log('viewer capture failed or timed out', e);
          }
        }
      }

      btn.textContent = '⤓ Uploading...';

      let uploadResult;
      if (best instanceof Blob) {
        uploadResult = await uploadToCloudinary(best, filenameFromSrc(imgEl.src || 'image.jpg'));
      } else if (typeof best === 'string') {
        uploadResult = await uploadToCloudinary(best, filenameFromSrc(best));
      } else {
        throw new Error('Unable to resolve image source');
      }

      const secure = (uploadResult && (uploadResult.secure_url || uploadResult.url));
      if (!secure) throw new Error('Cloudinary returned no URL');

      const price = extractPriceFromImageBubble(imageBubble, imgEl) || '';
      const payload = `${lastBuyer || ''}\n${secure}\n${price}`;

      try { GM_setClipboard(payload); } catch (e) { log('clipboard fail', e); }
      GM_notification({ title: 'Uploaded & copied', text: lastBuyer || '(no buyer)', timeout: 2500 });

      btn.textContent = '✔ Done';
      setTimeout(() => { btn.textContent = 'Copy Item'; btn.disabled = false; }, 1500);
      log('Payload:', payload);
    } catch (err) {
      console.error(err);
      GM_notification({ title: 'Upload failed', text: String(err.message || err), timeout: 5000 });
      btn.textContent = '❌';
      setTimeout(() => { btn.textContent = 'Copy Item'; btn.disabled = false; }, 1400);
    }
  }

  // attach buttons to text bubbles
  function attachToTextBubbles() {
    const bubbles = getTextBubbles();
    for (const b of bubbles) {
      if (b.dataset.copyBuyerAttached) continue;
      b.dataset.copyBuyerAttached = '1';
      const cs = window.getComputedStyle(b);
      if (cs.position === 'static' || !cs.position) b.style.position = 'relative';
      const buyerBtn = makeButton('Copy Buyer', '#4caf50');
      buyerBtn.style.right = '6px';
      b.appendChild(buyerBtn);

      let hideT = null;
      b.addEventListener('mouseenter', () => { if (hideT) clearTimeout(hideT); buyerBtn.style.visibility = 'visible'; buyerBtn.style.opacity = '1'; });
      b.addEventListener('mouseleave', () => { hideT = setTimeout(() => { buyerBtn.style.opacity = '0'; buyerBtn.style.visibility = 'hidden'; }, 140); });

      buyerBtn.addEventListener('click', (ev) => {
        ev.stopPropagation(); ev.preventDefault();
        handleCopyBuyer(b, buyerBtn);
      });
    }
  }

  // attach buttons to image bubbles
  function attachToImageBubbles() {
    const bubbles = getImageBubbles();
    for (const b of bubbles) {
      if (b.dataset.copyItemAttached) continue;
      b.dataset.copyItemAttached = '1';
      const cs = window.getComputedStyle(b);
      if (cs.position === 'static' || !cs.position) b.style.position = 'relative';
      const itemBtn = makeButton('Copy Item', '#1b6efd');
      itemBtn.style.left = '6px';
      itemBtn.style.right = 'auto';
      const cropBtn = makeButton('✂️ Crop', '#ff9800');
      cropBtn.style.left = '70px';
      cropBtn.style.right = 'auto';
      b.appendChild(itemBtn);
      b.appendChild(cropBtn);

      let hideT = null;
      b.addEventListener('mouseenter', () => { 
        if (hideT) clearTimeout(hideT); 
        itemBtn.style.visibility = 'visible'; 
        itemBtn.style.opacity = '1';
        cropBtn.style.visibility = 'visible';
        cropBtn.style.opacity = '1';
      });
      b.addEventListener('mouseleave', () => { 
        hideT = setTimeout(() => { 
          itemBtn.style.opacity = '0'; 
          itemBtn.style.visibility = 'hidden';
          cropBtn.style.opacity = '0';
          cropBtn.style.visibility = 'hidden';
        }, 140); 
      });

      itemBtn.addEventListener('click', (ev) => {
        ev.stopPropagation(); ev.preventDefault();
        handleCopyItemFromImageBubble(b, itemBtn, ev);
      });
      cropBtn.addEventListener('click', (ev) => {
        ev.stopPropagation(); ev.preventDefault();
        handleCropItemFromImageBubble(b, cropBtn, ev);
      });
    }
  }

  // scan and attach all
  function scanAttachAll() {
    attachToTextBubbles();
    attachToImageBubbles();
  }

  // initial scan & mutation observer
  const mo = new MutationObserver(scanAttachAll);
  mo.observe(document.documentElement || document.body, { childList: true, subtree: true });
  setTimeout(scanAttachAll, 500);
  setInterval(scanAttachAll, 2500);

  log('WhatsApp CopyBuyer/CopyItem/CropItem v3.3.0 initialized. Added crop functionality.');
})();

