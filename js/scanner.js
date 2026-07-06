/**
 * scanner.js -- Camera scanning, product lookup, and vendor price chain.
 *
 * Scanning strategy (in priority order):
 *   1. BarcodeDetector API  -- Chrome/Edge on Android and desktop (fastest)
 *   2. ZXing-JS via esm.sh  -- iOS Safari, Firefox, Safari on Mac (JS fallback)
 *   3. Manual entry         -- always available as a baseline
 *
 * ZXing is loaded dynamically via import() only when BarcodeDetector is
 * unavailable, so iOS/Firefox users pay no cost on first load and Android
 * users never load it at all.
 */

import { $, setStatus } from './utils.js';

let stream       = null;
let scanning     = false;
let detector     = null;  // BarcodeDetector instance (native)
let zxingControls = null; // ZXing IScannerControls (JS fallback)
let lastCode     = null;
let codeCount    = 0;
let missCount    = 0;
const CONFIRM_READS  = 3;
const MISS_TOLERANCE = 5;

const NATIVE = 'BarcodeDetector' in window;

export function initScanner() {
  document.getElementById('scanBtn')?.addEventListener('click', () => {
    if (scanning) {
      stopScan();
      document.getElementById('scanBtn').textContent = 'Scan Barcode';
    } else {
      startScan();
      document.getElementById('scanBtn').textContent = 'Stop Scanning';
    }
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

/* ---- Start ---------------------------------------------------------------- */

async function startScan() {
  if (NATIVE) {
    await startNativeScanner();
  } else {
    await startZXingScanner();
  }
}

/* ---- Native BarcodeDetector (Chrome / Edge) ------------------------------- */

async function startNativeScanner() {
  try {
    detector = new BarcodeDetector({
      formats: ['ean_13','ean_8','upc_a','upc_e','code_128','qr_code']
    });
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
    });
    setupVideo(stream);
    requestAnimationFrame(nativeScanLoop);
  } catch (e) {
    setStatus('cameraStatus', 'Camera failed: ' + e.message, 'err');
    resetScanBtn();
  }
}

async function nativeScanLoop() {
  if (!scanning) return;
  const video = document.getElementById('video');
  try {
    const codes = await detector.detect(video);
    if (codes.length > 0) {
      const code = codes[0].rawValue;
      const fmt  = codes[0].format || '';
      const expectedLengths = { ean_13: 13, ean_8: 8, upc_a: 12, upc_e: 8 };
      if (expectedLengths[fmt] && code.replace(/\D/g,'').length !== expectedLengths[fmt]) {
        requestAnimationFrame(nativeScanLoop); return;
      }
      handleFrame(code);
    } else {
      handleMiss();
    }
  } catch (e) { /* frame decode failed -- keep looping */ }
  if (scanning) requestAnimationFrame(nativeScanLoop);
}

/* ---- ZXing JS fallback (iOS Safari / Firefox / Safari on Mac) ------------- */

async function startZXingScanner() {
  setStatus('cameraStatus', 'Loading scanner...', 'info');
  try {
    // Dynamically import ZXing only when needed.
    // esm.sh resolves all dependencies automatically -- no CDN script tag needed.
    const { BrowserMultiFormatReader, NotFoundException } =
      await import('https://esm.sh/@zxing/browser@0.1.5');

    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
    });
    setupVideo(stream);

    const reader = new BrowserMultiFormatReader();
    // decodeFromStream calls our callback on every decoded frame.
    // NotFoundException means no barcode this frame -- normal, not an error.
    zxingControls = await reader.decodeFromStream(stream,
      document.getElementById('video'),
      (result, err) => {
        if (!scanning) return;
        if (result) {
          handleFrame(result.getText());
        } else if (err && err.name !== 'NotFoundException') {
          handleMiss();
        } else {
          handleMiss();
        }
      }
    );
  } catch (e) {
    if (e.name === 'NotAllowedError') {
      setStatus('cameraStatus', 'Camera permission denied. Allow camera access and try again.', 'err');
    } else if (e.message && e.message.includes('import')) {
      setStatus('cameraStatus', 'Scanner library failed to load. Check your connection, or type the barcode manually.', 'err');
    } else {
      setStatus('cameraStatus', 'Camera failed: ' + e.message, 'err');
    }
    resetScanBtn();
  }
}

/* ---- Shared frame handling ------------------------------------------------ */

function handleFrame(code) {
  missCount = 0;
  if (code !== lastCode) { lastCode = code; codeCount = 1; hideVendorPanel(); }
  else codeCount++;

  const pct = Math.round((codeCount / CONFIRM_READS) * 100);
  setStatus('cameraStatus', 'Hold steady... ' + pct + '%', 'info');

  if (codeCount >= CONFIRM_READS) {
    const confirmed = code;
    lastCode = null; codeCount = 0; missCount = 0;
    document.getElementById('barcode').value = confirmed;
    stopScan();
    resetScanBtn();
    setStatus('cameraStatus', 'Scanned: ' + confirmed + ' -- looking up...', 'info');
    lookupBarcode(confirmed);
  }
}

function handleMiss() {
  missCount++;
  if (missCount > MISS_TOLERANCE) { lastCode = null; codeCount = 0; missCount = 0; }
}

/* ---- Stop ----------------------------------------------------------------- */

export function stopScan() {
  scanning = false;
  if (zxingControls) { zxingControls.stop(); zxingControls = null; }
  if (stream)        { stream.getTracks().forEach(t => t.stop()); stream = null; }
  document.getElementById('video-wrap').style.display = 'none';
}

/* ---- Helpers -------------------------------------------------------------- */

function setupVideo(s) {
  const video = document.getElementById('video');
  video.srcObject = s;
  document.getElementById('video-wrap').style.display = 'block';
  // iOS Safari requires an explicit play() call after setting srcObject.
  // Without it the video element stays blank and ZXing decodes nothing.
  video.play().catch(e => console.warn('[Scanner] video.play() failed:', e.message));
  scanning = true;
  lastCode = null; codeCount = 0; missCount = 0;
  setStatus('cameraStatus', 'Point at a barcode...', 'info');
}

function resetScanBtn() {
  const btn = document.getElementById('scanBtn');
  if (btn) btn.textContent = 'Scan Barcode';
}

/* ---- Product lookup ------------------------------------------------------- */

export async function lookupBarcode(code) {
  let found = false;
  try {
    const res  = await fetch('https://world.openfoodfacts.org/api/v2/product/' + code + '.json');
    const data = await res.json();
    if (data.status === 1 && data.product) {
      const p    = data.product;
      const name = p.product_name || p.generic_name || '';
      if (name) { document.getElementById('description').value = name; found = true; }
      if (p.quantity) {
        const m = p.quantity.match(/\b(ml|mL|L|l|g|kg|oz|lb|fl\s?oz|cl)\b/);
        if (m) {
          const u   = m[1].replace(/\s/,'').toLowerCase();
          const sel = document.getElementById('unit');
          const opt = sel ? [...sel.options].find(o => o.value.toLowerCase() === u) : null;
          if (sel) {
            if (opt) { sel.value = opt.value; }
            else {
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
  lookupVendorPrices(code, document.getElementById('description')?.value?.trim() || '')
    .catch(() => {});
}

/* ---- Vendor price lookup -------------------------------------------------- */

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
  if (shopLink) shopLink.href = 'https://www.google.com/search?tbm=shop&q=' + searchQ;

  const cacheKey = 'vp_' + barcode;
  const cached   = sessionStorage.getItem(cacheKey);
  if (cached) { renderVendorOffers(JSON.parse(cached), list, status); return; }

  try {
    let offers = [];

    try {
      const res  = await fetch('https://api.upcitemdb.com/prod/trial/lookup?upc=' + barcode);
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

    if (offers.length === 0) {
      try {
        const res  = await fetch('https://prices.openfoodfacts.org/api/v1/prices?product_code=' + barcode + '&page_size=20');
        const data = await res.json();
        if (data.items?.length) {
          const byStore = {};
          data.items.forEach(item => {
            const key = item.location_osm_name || item.owner || 'Store';
            const p   = parseFloat(item.price) || 0;
            if (p > 0 && (!byStore[key] || p < byStore[key])) byStore[key] = p;
          });
          offers = Object.entries(byStore)
            .filter(([,p]) => p > 0)
            .map(([merchant, price]) => ({ merchant, price, shipping: 0, total: price, condition: 'in-store' }));
        }
      } catch (e) { /* OFF Prices unavailable */ }
    }

    offers = offers.sort((a,b) => a.total - b.total).slice(0, 8);
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
    return '<div class="vendor-item' + (i === 0 ? ' vendor-best' : '') + '"'
      + ' onclick="selectVendorPrice(' + o.price + ',\'' + o.merchant.replace(/'/g,"\\'") + '\')">'
      + '<span class="vendor-item-name">' + (i === 0 ? '[best] ' : '') + o.merchant + '</span>'
      + '<span class="vendor-item-cond">' + o.condition + '</span>'
      + '<div style="text-align:right;">'
      + '<span class="vendor-item-price">$' + o.price.toFixed(2) + '</span>' + freeShip
      + '</div></div>';
  }).join('');
  if (status) status.textContent = offers.length + ' vendor' + (offers.length !== 1 ? 's' : '') + ' found - cheapest first';
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
