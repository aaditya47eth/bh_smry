// ==UserScript==
// @name         WhatsApp: Upload tagged image from text bubble (better-res) - daye1yfzy / bh_smry_upload
// @namespace    http://tampermonkey.net/
// @version      1.6
// @description  Upload associated image from a WhatsApp text bubble to Cloudinary. Stronger heuristics to get original/high-res image. Does NOT open viewer by default; hold Shift while clicking to explicitly allow opening viewer to capture full-res blob. Uses GM_xmlhttpRequest for uploads (avoids CSP). Copies Cloudinary URL to clipboard.
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
    const BUTTON_TEXT = '☁ Upload image';
    const LOG = true; // set false to silence console logs
  
    function log(...args) { if (LOG) console.log('[WA-CloudUploader]', ...args); }
  
    // button factory
    function makeButton() {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = BUTTON_TEXT;
      b.title = 'Upload associated image to Cloudinary — hold Shift while clicking to open viewer (explicit)';
      Object.assign(b.style, {
        position: 'absolute',
        right: '6px',
        top: '6px',
        padding: '4px 8px',
        background: '#1b6efd',
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
  
    // attach to bubble
    function attachToBubble(bubble) {
      if (!bubble || bubble.dataset.uplAttached) return;
      bubble.dataset.uplAttached = '1';
      const cs = window.getComputedStyle(bubble);
      if (cs.position === 'static' || !cs.position) bubble.style.position = 'relative';
      const btn = makeButton();
      bubble.appendChild(btn);
  
      let hideT = null;
      bubble.addEventListener('mouseenter', () => { if (hideT) clearTimeout(hideT); btn.style.visibility = 'visible'; btn.style.opacity = '1'; });
      bubble.addEventListener('mouseleave', () => { hideT = setTimeout(()=>{ btn.style.opacity='0'; btn.style.visibility='hidden'; }, 140); });
  
      btn.addEventListener('click', async (ev) => {
        ev.stopPropagation(); ev.preventDefault();
        const allowViewer = ev.shiftKey === true;
        await handleUpload(bubble, btn, { allowViewer });
      });
    }
  
    // find associated image for this text bubble
    function findAssociatedImage(bubble) {
      // 1) image inside the same bubble (quoted preview etc.)
      const inside = bubble.querySelectorAll('img');
      if (inside.length) return inside[0];
  
      // 2) get sender prefix from data-pre-plain-text span
      const pre = bubble.querySelector('[data-pre-plain-text]');
      let senderKey = null;
      if (pre) {
        const raw = pre.getAttribute('data-pre-plain-text') || '';
        const m = raw.match(/^\[([^\]]+)\]/);
        senderKey = m ? m[1].trim() : raw.split(':')[0].trim() || null;
      }
  
      // 3) collect ordered message bubbles (by their pre spans) in page order
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
      const LOOKBACK = 12;
      for (let i = start; i >= 0 && i >= start - LOOKBACK; i--) {
        const cand = bubbles[i];
        if (!cand) continue;
        if (senderKey) {
          const span = cand.querySelector('[data-pre-plain-text]');
          if (!span) continue;
          if (!span.getAttribute('data-pre-plain-text')?.includes(senderKey)) continue;
        }
        const imgs = cand.querySelectorAll('img');
        if (imgs.length) return imgs[0];
      }
  
      // 4) fallback: nearest image element above bubble
      const allImgs = Array.from(document.querySelectorAll('img'));
      if (!allImgs.length) return null;
      const rect = bubble.getBoundingClientRect();
      let candidate = null;
      for (const im of allImgs) {
        const r = im.getBoundingClientRect();
        if (r.top < rect.top) candidate = im;
      }
      return candidate;
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
              const w = token && token.endsWith('w') ? parseInt(token.slice(0,-1),10) : 0;
              candidates.push({url, w});
            });
          }
          if (candidates.length) {
            candidates.sort((a,b)=>b.w-a.w);
            log('Picked picture/source candidate', candidates[0]);
            return candidates[0].url;
          }
        }
  
        const srcset = imgEl.getAttribute('srcset');
        if (srcset) {
          const parts = srcset.split(',').map(p=>p.trim()).map(s=>{
            const [url, token] = s.split(/\s+/);
            const w = token && token.endsWith('w') ? parseInt(token.slice(0,-1),10) : 0;
            return {url, w};
          }).sort((a,b)=>b.w-a.w);
          if (parts.length) { log('Chosen srcset candidate', parts[0]); return parts[0].url; }
        }
      } catch (e) { log('srcset/picture parse error', e); }
  
      // 2. common data-* attributes
      const tryAttrs = ['data-download-url','data-original','data-src','data-file','data-preview','data-plain-src','data-enc','data-ref','data-thumbnail','data-download','data-media'];
      for (const a of tryAttrs) {
        try {
          const v = imgEl.getAttribute(a) || (imgEl.dataset && imgEl.dataset[a.replace('data-','')]);
          if (v) { log('Found data-* attr', a, v); return v; }
        } catch (e) {}
      }
  
      // 3. check parent anchor href (download links or direct media links)
      try {
        let parent = imgEl.parentElement;
        for (let i=0;i<6 && parent;i++, parent = parent.parentElement) {
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
        for (let i=0;i<6 && ancestor;i++, ancestor = ancestor.parentElement) {
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
          const imgs = Array.from(container.querySelectorAll('img')).filter(i=>i!==imgEl);
          imgs.sort((a,b)=> (b.naturalWidth*b.naturalHeight) - (a.naturalWidth*a.naturalHeight));
          if (imgs.length && imgs[0].naturalWidth*imgs[0].naturalHeight > (imgEl.naturalWidth*imgEl.naturalHeight)) {
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
    async function captureFromViewer(imgEl, timeoutMs = 2000) {
      try {
        // attempt to open viewer by simulating click on the clickable element around image (if it exists)
        // find clickable ancestor (role=button or tag button or anchor)
        let clickable = imgEl;
        for (let i=0;i<6 && clickable;i++, clickable = clickable.parentElement) {
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
            const imgs = Array.from(document.querySelectorAll('img')).filter(i=>{
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
          try { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); } catch(e){}
          throw new Error('Viewer image not found within timeout');
        }
  
        // fetch blob of found image
        const src = found.src || '';
        if (!src) {
          // close viewer
          try { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); } catch(e){}
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
        try { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); } catch(e){}
  
        if (!blob) throw new Error('Failed to download viewer image');
        log('Captured blob from viewer, size', blob.size);
        return blob;
      } catch (e) {
        log('captureFromViewer error', e);
        // ensure viewer closed
        try { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); } catch(e){}
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
  
    // main handler
    async function handleUpload(bubble, btn, opts = { allowViewer: false }) {
      try {
        if (btn) { btn.disabled = true; btn.textContent = '⤓ Locating...'; }
        const imgEl = findAssociatedImage(bubble);
        if (!imgEl) {
          GM_notification({ title: 'Upload failed', text: 'Could not find an associated image for this message.', timeout: 3500 });
          if (btn) { btn.disabled = false; btn.textContent = BUTTON_TEXT; }
          return;
        }
  
        if (btn) btn.textContent = '⤓ Resolving source...';
        let best = await resolveBestSource(imgEl, opts);
  
        // If user explicitly allowed viewer capture and best is still likely a thumbnail, attempt viewer capture:
        if (opts.allowViewer && !(best instanceof Blob)) {
          // if best looks same as thumbnail (small dimensions) attempt viewer capture
          const thumbArea = (imgEl.naturalWidth || imgEl.width) * (imgEl.naturalHeight || imgEl.height);
          if (!thumbArea || thumbArea < 40000) { // small thumbnail, prefer viewer capture
            try {
              if (btn) btn.textContent = '⤓ Capturing viewer...';
              const blob = await captureFromViewer(imgEl, 2200);
              if (blob) best = blob;
            } catch (e) {
              log('viewer capture failed or timed out', e);
            }
          }
        }
  
        if (btn) btn.textContent = '⤓ Preparing upload...';
  
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
  
        try { GM_setClipboard(secure); } catch (e) { log('clipboard fail', e); }
        GM_notification({ title: 'Uploaded', text: 'Image uploaded and URL copied to clipboard', timeout: 3500 });
  
        if (btn) { btn.textContent = '✔ Done'; setTimeout(()=> { btn.disabled = false; btn.textContent = BUTTON_TEXT; }, 1600); }
        log('Uploaded OK', secure, uploadResult);
      } catch (err) {
        console.error(err);
        GM_notification({ title: 'Upload failed', text: String(err.message || err), timeout: 6000 });
        if (btn) { btn.disabled = false; btn.textContent = BUTTON_TEXT; }
      }
    }
  
    // initial scan & mutation observer
    function scanAttachAll() {
      const bubbles = getTextBubbles();
      for (const b of bubbles) attachToBubble(b);
    }
    const mo = new MutationObserver(scanAttachAll);
    mo.observe(document.documentElement || document.body, { childList: true, subtree: true });
    setTimeout(scanAttachAll, 500);
    setInterval(scanAttachAll, 2500);
  
    log('WhatsApp uploader (better-res) initialized. Hold Shift while clicking Upload to allow viewer-capture.');
  })();

