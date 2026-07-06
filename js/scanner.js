/**
 * scanner.js -- Camera scanning, product lookup, and vendor price chain.
 *
 * Vendor lookup order:
 *   1. UPCitemdb free API (offers with merchant + price)
 *   2. Open Food Facts Prices API (crowdsourced, broader coverage)
 *   3. Google Shopping fallback link (always shown)
 */

import { $, setStatus } from './utils.js';

let stream    = null;
let scanning  = false;
let detector  = null;
let html5QrCode = null; // For html5-qrcode fallback
let lastCode  = null;
let codeCount = 0;
let missCount = 0;
const CONFIRM_READS  = 3;
const MISS_TOLERANCE = 5;

export function initScanner() {
  document.getElementById('scanBtn')?.addEventListener('click', () => {
    if (scanning) { stopScan(); document.getElementById('scanBtn').textContent = '[camera] Scan Barcode'; }
    else          { startScan(); document.getElementById('scanBtn').textContent = '[stop] Stop Scanning'; }
  });

  document.getElementById('barcode')?.addEventListener('change', () => {
    const v = document.getElementById('barcode').value.trim();
    if (v) lookupBarcode(v);
  });

  document.getElementById('unit')?.addEventListener('change', function () {
    const custom = document.getElementById('unitCustom');
    if (custom) custom.style.display = this.value === 'custom' ? 'block' : 'none';
  });
}

async function startScan() {
  // Try to use BarcodeDetector (Chrome/Android) first
  if ('BarcodeDetector' in window) {
    try {
      detector = new BarcodeDetector({ formats: ['ean_13','ean_8','upc_a','upc_e','code_128','qr_code'] });
      stream   = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      const video = document.getElementById('video');
      video.srcObject = stream;
      document.getElementById('video-wrap').style.display = 'block';
      scanning = true;
      lastCode = null; codeCount = 0; missCount = 0;
      requestAnimationFrame(scanLoop);
      return;
    } catch (e) {
      setStatus('cameraStatus', 'Camera failed: ' + e.message, 'err');
      return;
    }
  }
  
  // Fallback to html5-qrcode for iOS Safari and other browsers
  try {
    const videoContainer = document.getElementById('video-wrap');
    videoContainer.style.display = 'block';
    scanning = true;
    lastCode = null; codeCount = 0; missCount = 0;
    
    // Create a unique container ID for html5-qrcode to avoid conflicts
    const containerId = `html5-qrcode-${Date.now()}`;
    const videoElement = document.getElementById('video');
    
    // Wrap the video element in a container for html5-qrcode
    const wrapper = document.createElement('div');
    wrapper.id = containerId;
    wrapper.style.width = '100%';
    wrapper.style.maxWidth = '400px';
    wrapper.style.margin = '0 auto';
    
    // Replace the video element with the wrapper
    videoElement.parentNode.replaceChild(wrapper, videoElement);
    wrapper.appendChild(videoElement);
    
    html5QrCode = new window.Html5Qrcode(containerId);
    // Fallback check for library loading
    if (!window.Html5Qrcode) {
        throw new Error('html5-qrcode library failed to load');
    }
    const config = { fps: 10, qrbox: { width: 250, height: 250 } };
    
    await html5QrCode.start(
      { facingMode: "environment" },
      config,
      (decodedText, decodedResult) => {
        // Handle successful scan
        if (decodedText && decodedText !== lastCode) {
          lastCode = decodedText;
          codeCount++;
          
          // Require multiple consecutive reads for confirmation
          if (codeCount >= CONFIRM_READS) {
            lastCode = null;
            codeCount = 0;
            stopScan();
            document.getElementById('scanBtn').textContent = '[camera] Scan Barcode';
            document.getElementById('barcode').value = decodedText;
            setStatus('cameraStatus', `Scanned: ${decodedText} -- looking up...`, 'info');
            lookupBarcode(decodedText);
          } else {
            setStatus('cameraStatus', `Hold steady... ${Math.round((codeCount / CONFIRM_READS) * 100)}%`, 'info');
          }
        }
      },
      (errorMessage) => {
        // Handle scan error (continuously called, so we ignore minor errors)
        // Only show persistent errors
        if (errorMessage.includes("Cannot read properties") || errorMessage.includes("NotFoundError")) {
          console.error('QR Code error:', errorMessage);
        }
      }
    );
    
    setStatus('cameraStatus', 'Scanner initialized. Point camera at barcode.', 'info');
  } catch (e) {
    setStatus('cameraStatus', 'Failed to initialize scanner: ' + e.message, 'err');
    scanning = false;
    // Restore video element if wrapper creation failed
    const wrapper = document.querySelector('[id^="html5-qrcode-"]');
    if (wrapper && wrapper.parentNode) {
      const videoElement = wrapper.querySelector('video');
      if (videoElement) {
        wrapper.parentNode.replaceChild(videoElement, wrapper);
      }
    }
  }
}

function stopScan() {
  scanning = false;
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
  if (html5QrCode) {
    html5QrCode.stop().then(() => {
      html5QrCode = null;
      
      // Restore original video element structure
      const wrapper = document.querySelector('[id^="html5-qrcode-"]');
      if (wrapper && wrapper.parentNode) {
        const videoElement = wrapper.querySelector('video');
        if (videoElement) {
          const videoWrapper = document.getElementById('video-wrap');
          videoWrapper.innerHTML = ''; // Clear wrapper
          videoWrapper.appendChild(videoElement); // Put video back directly
        }
        wrapper.remove(); // Remove wrapper
      }
    }).catch(err => {
      console.error('Error stopping html5-qrcode:', err);
    });
  }
  document.getElementById('video-wrap').style.display = 'none';
}

export async function lookupBarcode(code) {
  let found = false;
  try {
    const res  = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json`);
    const data = await res.json();
    if (data.status === 1 && data.product) {
      const p    = data.product;
      const name = p.product_name || p.generic_name || '';
      if (name) { document.getElementById('description').value = name; found = true; }

      // Parse unit from quantity string e.g. "330 ml", "500g", "12 x 35g"
      if (p.quantity) {
        const m = p.quantity.match(/\b(ml|mL|L|l|g|kg|oz|lb|fl\s?oz|cl)\b/);
        if (m) {
          const u   = m[1].replace(/\s/, '').toLowerCase();
          const sel = document.getElementById('unit');
          const opt = sel ? [...sel.options].find(o => o.value.toLowerCase() === u) : null;
          if (sel) {
            if (opt)  { sel.value = opt.value; }
            else      {
              sel.value = 'custom';
              const custom = document.getElementById('unitCustom');
              if (custom) { custom.style.display = 'block'; custom.value = m[1]; }
            }
          }
        }
      }
    }
    setStatus('cameraStatus',
      found ? 'Found public data -- review and adjust before saving.'
            : 'No public match -- fill in the details below.',
      found ? 'ok' : 'info');
  } catch (e) {
    setStatus('cameraStatus', 'Lookup failed -- fill in details manually.', 'warn');
  }

  // Trigger vendor price lookup in parallel (non-blocking)
  lookupVendorPrices(code, document.getElementById('description')?.value?.trim() || '')
    .catch(() => {});
}

/** -- Vendor Price Lookup ---------------------------------------------------- */

export async function lookupVendorPrices(barcode, productName) {
  const panel    = document.getElementById('vendor-panel');
  const list     = document.getElementById('vendor-list');
  const status   = document.getElementById('vendor-status');
  const shopLink = document.getElementById('vendor-shop-link');
  if (!panel) return;

  panel.style.display = 'block';
  list.innerHTML = '<div style="padding:10px;color:var(--muted);font-size:0.8rem;">Searching vendors...</div>';
  if (status) status.textContent = '';

  const searchQ = encodeURIComponent(productName || barcode);
  if (shopLink) shopLink.href = `https://www.google.com/search?tbm=shop&q=${searchQ}`;

  // Session cache -- same barcode won't burn daily API limit on re-scan
  const cacheKey = 'vp_' + barcode;
  const cached   = sessionStorage.getItem(cacheKey);
  if (cached) { renderVendorOffers(JSON.parse(cached), list, status); return; }

  try {
    let offers = [];

    // Source 1: UPCitemdb (best merchant + price data, 100/day free)
    try {
      const res  = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${barcode}`);
      const data = await res.json();
      if (data.code === 'OK' || !data.code) {
        const item = (data.items || [])[0] || {};
        offers = (item.offers || [])
          .filter(o => parseFloat(o.price) > 0)
          .map(o => ({
            merchant:  o.merchant || 'Unknown',
            price:     parseFloat(o.price),
            shipping:  parseFloat(o.shipping) || 0,
            total:     parseFloat(o.price) + (parseFloat(o.shipping) || 0),
            condition: o.condition || 'new',
          }));
      }
    } catch (e) { /* UPCitemdb unavailable */ }

    // Source 2: Open Food Facts Prices (crowdsourced, broader coverage)
    if (offers.length === 0) {
      try {
        const res  = await fetch(`https://prices.openfoodfacts.org/api/v1/prices?product_code=${barcode}&page_size=20`);
        const data = await res.json();
        if (data.items?.length) {
          const byStore = {};
          data.items.forEach(item => {
            const key = item.location_osm_name || item.owner || 'Store';
            const p   = parseFloat(item.price) || 0;
            if (p > 0 && (!byStore[key] || p < byStore[key])) byStore[key] = p;
          });
          offers = Object.entries(byStore)
            .filter(([, p]) => p > 0)
            .map(([merchant, price]) => ({ merchant, price, shipping: 0, total: price, condition: 'in-store' }));
        }
      } catch (e) { /* OFF Prices unavailable */ }
    }

    offers = offers.sort((a, b) => a.total - b.total).slice(0, 8);
    sessionStorage.setItem(cacheKey, JSON.stringify(offers));
    renderVendorOffers(offers, list, status);

  } catch (e) {
    list.innerHTML = '<div style="padding:10px;color:var(--muted);font-size:0.8rem;">Vendor lookup unavailable -- try the search link above.</div>';
  }
}

function renderVendorOffers(offers, list, status) {
  if (!offers?.length) {
    list.innerHTML = '<div style="padding:10px;color:var(--muted);font-size:0.8rem;">No vendor listings found -- try the search link above.</div>';
    return;
  }
  list.innerHTML = offers.map((o, i) => {
    const freeShip = o.shipping === 0 ? '<span class="vendor-item-ship">free ship</span>' : '';
    return `<div class="vendor-item${i === 0 ? ' vendor-best' : ''}"
      onclick="selectVendorPrice(${o.price},'${o.merchant.replace(/'/g,"\\'")}')">
      <span class="vendor-item-name">${i === 0 ? '[best] ' : ''}${o.merchant}</span>
      <span class="vendor-item-cond">${o.condition}</span>
      <div style="text-align:right;">
        <span class="vendor-item-price">$${o.price.toFixed(2)}</span>${freeShip}
      </div></div>`;
  }).join('');
  if (status) status.textContent = offers.length + ' vendor' + (offers.length !== 1 ? 's' : '') + ' found . cheapest first';
}

export function selectVendorPrice(price, merchant) {
  const priceEl = document.getElementById('price');
  if (priceEl) priceEl.value = price.toFixed(2);
  const tag = document.getElementById('priceTag');
  if (tag) tag.textContent = '(from ' + merchant + ')';
}

export function hideVendorPanel() {
  const panel = document.getElementById('vendor-panel');
  if (panel) panel.style.display = 'none';
  const list = document.getElementById('vendor-list');
  if (list) list.innerHTML = '';
}

// Keep the original scanLoop for BarcodeDetector path
async function scanLoop() {
  if (!scanning) return;
  const video = document.getElementById('video');
  try {
    const codes = await detector.detect(video);
    if (codes.length > 0) {
      const code = codes[0].rawValue;
      const fmt  = codes[0].format || '';

      // Reject codes whose digit count doesn't match the declared format
      const expectedLengths = { ean_13: 13, ean_8: 8, upc_a: 12, upc_e: 8 };
      if (expectedLengths[fmt] && code.replace(/\D/g, '').length !== expectedLengths[fmt]) {
        requestAnimationFrame(scanLoop); return;
      }

      missCount = 0;
      if (code !== lastCode) { lastCode = code; codeCount = 1; hideVendorPanel(); }
      else codeCount++;

      setStatus('cameraStatus', `Hold steady... ${Math.round((codeCount / CONFIRM_READS) * 100)}%`, 'info');

      if (codeCount >= CONFIRM_READS) {
        lastCode = null; codeCount = 0; missCount = 0;
        document.getElementById('barcode').value = code;
        stopScan();
        document.getElementById('scanBtn').textContent = '[camera] Scan Barcode';
        setStatus('cameraStatus', `Scanned: ${code} (${fmt || 'barcode'}) -- looking up...`, 'info');
        lookupBarcode(code);
        return;
      }
    } else {
      missCount++;
      if (missCount > MISS_TOLERANCE) { lastCode = null; codeCount = 0; missCount = 0; }
    }
  } catch (e) { /* frame decode failed -- keep looping */ }
  requestAnimationFrame(scanLoop);
}
