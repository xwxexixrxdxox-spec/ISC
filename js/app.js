/**
 * app.js — Main entry point.
 * Handles screen routing, tab switching, submit, sheet opener, and boot.
 *
 * Module map:
 *   state.js     — S object, CLIENT_ID, localStorage helpers
 *   utils.js     — $(), setStatus(), withRetry()
 *   api.js       — Sheets API (read, append, batchUpdate, row formatting)
 *   auth.js      — OAuth, token refresh, ensureToken
 *   setup.js     — Sheet creation, Drive search, setup wizard
 *   offline.js   — Offline queue, writeToSheet, flushOfflineQueue
 *   scanner.js   — Camera, barcode detection, product + vendor lookup
 *   inventory.js — List view, quick adjust, edit modal, thresholds
 *   undo.js      — 30-second undo with countdown toast
 *   pwa.js       — Install prompt, service worker registration
 *   app.js       — This file: routing, submit, boot
 */

import { S, CLIENT_ID, getThreshold } from './state.js';
import { $, setStatus }               from './utils.js';
import { ensureToken, requestToken, scheduleTokenRefresh } from './auth.js';
import { runFullSetup }               from './setup.js';
import { writeToSheet, flushOfflineQueue, updateOfflineBar, queueWrite } from './offline.js';
import { initScanner, selectVendorPrice } from './scanner.js';
import {
  loadInventoryView, updateLowStockBadge,
  openMinQtyModal, openEditModal, saveEditedItem,
  saveThreshold, quickAdjust, initInventory,
  renderShoppingList, openItemHistory,
} from './inventory.js';
import { showUndoToast, initUndo }    from './undo.js';
import { initInstallBanner, registerServiceWorker } from './pwa.js';

/* ─── Error Boundary ──────────────────────────────────────────────────────── */
window.addEventListener('error', e => {
  console.error('[Global]', e.message);
  const el = document.getElementById('error-recovery');
  const mg = document.getElementById('error-msg');
  if (el && mg) { mg.textContent = e.message || 'Unknown error.'; el.style.display = 'block'; setTimeout(() => { el.style.display = 'none'; }, 8000); }
});
window.addEventListener('unhandledrejection', e => {
  if (e.reason?.name === 'AbortError') return;
  const el = document.getElementById('error-recovery');
  const mg = document.getElementById('error-msg');
  if (el && mg) { mg.textContent = e.reason?.message || 'A background operation failed.'; el.style.display = 'block'; setTimeout(() => { el.style.display = 'none'; }, 6000); }
});

/* ─── Screen Router ───────────────────────────────────────────────────────── */
const SCREENS = ['screen-welcome', 'screen-setup', 'screen-main'];

export function show(id) {
  SCREENS.forEach(s => $(s)?.classList.add('hidden'));
  $(id)?.classList.remove('hidden');
  const nav = document.getElementById('bottom-nav');
  if (nav) nav.style.display = id === 'screen-main' ? 'flex' : 'none';
}

function switchTab(tab) {
  S.currentTab = tab;
  ['scan','inv','list'].forEach(t => {
    document.getElementById('tab-'  + t)?.classList.toggle('active', tab === t);
    document.getElementById('tab-'  + t)?.setAttribute('aria-selected', tab === t ? 'true' : 'false');
    document.getElementById('pane-' + t)?.classList.toggle('hidden', tab !== t);
  });
  // Show scan FAB only on inventory tab
  const fab = document.getElementById('inv-scan-fab');
  if (fab) fab.style.display = tab === 'inv' ? 'flex' : 'none';

  if (tab === 'inv')  loadInventoryView();
  if (tab === 'list') renderShoppingList();
}

/* ─── Init ────────────────────────────────────────────────────────────────── */
function init() {
  if (S.sheetUrl && !S.spreadsheetId) {
    const m = S.sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    if (m) { S.spreadsheetId = m[1]; localStorage.setItem('spreadsheetId', m[1]); }
  }
  if (S.spreadsheetId) { show('screen-main'); initMain(); return; }
  show('screen-welcome');
}

/* ─── Welcome Screen ──────────────────────────────────────────────────────── */
// ─── Join shared sheet ────────────────────────────────────────────────────────
document.getElementById('joinSheetBtn')?.addEventListener('click', () => {
  const raw = (document.getElementById('joinSheetUrl')?.value || '').trim();
  if (!raw) { setStatus('joinStatus', 'Paste a Google Sheets URL or spreadsheet ID.', 'err'); return; }
  // Extract spreadsheet ID from URL or use as-is
  const match = raw.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  const spreadsheetId = match ? match[1] : raw;
  if (!/^[a-zA-Z0-9_-]{20,}$/.test(spreadsheetId)) {
    setStatus('joinStatus', 'That doesn’t look like a valid spreadsheet URL or ID.', 'err');
    return;
  }
  setStatus('joinStatus', 'Signing in to connect…', 'info');
  // Sign in then connect to the given sheet — skip creation entirely
  if (!window.google?.accounts?.oauth2) {
    setStatus('joinStatus', 'Google still loading — please wait a moment.', 'warn'); return;
  }
  const btn = document.getElementById('joinSheetBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Connecting…'; }
  requestToken(() => {
    const sheetUrl = 'https://docs.google.com/spreadsheets/d/' + spreadsheetId;
    localStorage.setItem('sheetUrl', sheetUrl);
    localStorage.setItem('spreadsheetId', spreadsheetId);
    S.sheetUrl = sheetUrl;
    S.spreadsheetId = spreadsheetId;
    setStatus('joinStatus', '✅ Connected! Loading…', 'ok');
    setTimeout(() => { show('screen-main'); initMain(); }, 800);
  });
});

document.getElementById('connectGoogleBtn')?.addEventListener('click', () => {
  if (!window.google?.accounts?.oauth2) {
    setStatus('connectStatus', 'Still loading Google services — please wait and try again.', 'warn');
    return;
  }
  const btn = document.getElementById('connectGoogleBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = 'Connecting\u2026'; }
  setStatus('connectStatus', 'Opening Google sign-in\u2026', 'info');
  try { requestToken(runFullSetup); }
  catch (e) {
    setStatus('connectStatus', 'Sign-in error: ' + e.message, 'err');
    if (btn) { btn.disabled = false; btn.innerHTML = '<span style="font-size:1.1rem;">G</span> &nbsp;Sign in with Google'; }
  }
});

/* ─── Main Screen ─────────────────────────────────────────────────────────── */
export function initMain() {
  [$('sheetLink'), $('sheetLinkFull')].forEach(el => {
    if (!el) return;
    el.href = S.sheetUrl || '#';
    el.addEventListener('click', e => { e.preventDefault(); if (S.sheetUrl) window.open(S.sheetUrl, '_blank', 'noopener'); });
  });

  document.getElementById('resetBtn')?.addEventListener('click', () => {
    if (confirm('Re-authenticate with Google?\n\nKeeps your existing sheet — just refreshes sign-in.')) {
      S.accessToken = null;
      location.reload();
    }
  });

  document.getElementById('freshBtn')?.addEventListener('click', () => {
    if (confirm('Start fresh?\n\nCreates a new sheet. Your old sheet stays safely in Google Drive.')) {
      sessionStorage.setItem('force-new-sheet', '1');
      ['sheetUrl','spreadsheetId','offlineQueue','minQty'].forEach(k => localStorage.removeItem(k));
      location.reload();
    }
  });

  document.getElementById('tab-scan')?.addEventListener('click',  () => switchTab('scan'));
  document.getElementById('tab-inv')?.addEventListener('click',   () => switchTab('inv'));
  document.getElementById('tab-list')?.addEventListener('click',  () => switchTab('list'));

  // Scan FAB on inventory tab — scans and pre-fills the scan pane
  document.getElementById('inv-scan-fab')?.addEventListener('click', () => {
    switchTab('scan');
    document.getElementById('scanBtn')?.click();
  });

  // Share shopping list button
  document.getElementById('share-list-btn')?.addEventListener('click', shareShoppingList);

  updateOfflineBar();
  updateLowStockBadge();
  flushOfflineQueue();
  scheduleTokenRefresh();
  initUndo();
  initInstallBanner();
  initScanner();
  initInventory();

  /** Share the current shopping list via Web Share API */
async function shareShoppingList() {
  const items = S.inventoryCache.filter(r => {
    const { min } = getThreshold(String(r[0]||''));
    return min > 0 && (Number(r[2])||0) <= min;
  });
  if (!items.length) { alert('No items below minimum threshold.'); return; }
  const lines = items.map(r => {
    const { min, max } = getThreshold(String(r[0]||''));
    const qty     = Number(r[2]) || 0;
    const reorder = max > 0 ? (max - qty) : (min - qty + min);
    return `• ${r[1]||r[0]} — order ${reorder > 0 ? reorder : min} ${r[3]||''}`.trim();
  });
  const text = 'Reorder list:
' + lines.join('
');
  if (navigator.share) {
    navigator.share({ title: 'Inventory Reorder List', text }).catch(() => {});
  } else {
    navigator.clipboard?.writeText(text).then(() => alert('List copied to clipboard!'));
  }
}

// Cross-module events (replaces circular imports)
  window.addEventListener('show-undo', e => showUndoToast(e.detail.payload, e.detail.newQty));
  window.addEventListener('update-badge', () => updateLowStockBadge());

  const diag = document.getElementById('diag-panel');
  if (diag) diag.style.display = 'none';
}

/* ─── Submit Handler ──────────────────────────────────────────────────────── */
async function submitChange(direction, isRetry) {
  const spreadsheetId = S.spreadsheetId;
  const barcode       = document.getElementById('barcode')?.value.trim()     || '';
  const description   = document.getElementById('description')?.value.trim() || '';
  const qty           = parseInt(document.getElementById('qty')?.value, 10)   || 0;

  if (!barcode)       { setStatus('result', 'Scan or enter a barcode first.', 'err'); return; }
  if (!spreadsheetId) { setStatus('result', 'Not connected \u2014 use Reset & Reconnect in Settings.', 'err'); return; }
  if (!S.accessToken) { setStatus('result', 'Signing in\u2026', 'info'); await ensureToken(); }

  const unitSel = document.getElementById('unit');
  const unit    = unitSel?.value === 'custom'
    ? (document.getElementById('unitCustom')?.value.trim() || 'ea')
    : (unitSel?.value || 'ea');
  const price     = document.getElementById('price')?.value.trim() || '';
  const qtyChange = direction === 'add' ? qty : -qty;
  const payload   = { spreadsheetId, barcode, description, qtyChange, unit, price, timestamp: new Date().toLocaleString() };

  if (!navigator.onLine) {
    queueWrite(payload);
    setStatus('result', '\ud83d\udce1 Offline \u2014 change queued and will sync automatically.', 'warn');
    updateOfflineBar();
    return;
  }

  setStatus('result', 'Saving\u2026', 'info');
  try {
    const result = await writeToSheet(payload);
    if (result.queued) {
      setStatus('result', '\ud83d\udce1 Queued \u2014 will sync when connection returns.', 'warn');
    } else {
      const sign = direction === 'add' ? '\u2705 +' : '\u2705 \u2212';
      setStatus('result', sign + qty + ' \u2014 Stock: ' + result.newQty, 'ok');
      S.inventoryCache = [];
      updateLowStockBadge();
      showUndoToast(payload, result.newQty);
    }
  } catch (e) {
    if (e.message === 'TOKEN_EXPIRED' && !isRetry) {
      setStatus('result', 'Session expired \u2014 refreshing\u2026', 'info');
      S.accessToken = null;
      await ensureToken();
      submitChange(direction, true);
    } else {
      setStatus('result', '\u274c ' + e.message, 'err');
    }
  }
}

document.getElementById('addBtn')?.addEventListener('click', () => submitChange('add'));
document.getElementById('subBtn')?.addEventListener('click', () => submitChange('subtract'));

/* ─── Expose globals for inline onclick attributes in dynamic HTML ─────────
   ES modules are scoped — functions used in onclick="..." strings on
   dynamically generated rows must be attached to window explicitly.       */
Object.assign(window, {
  openMinQtyModal,
  saveThreshold,
  quickAdjust,
  openEditModal,
  saveEditedItem,
  selectVendorPrice,
  openItemHistory,
});

/* ─── Self-Healing Service Worker ────────────────────────────────────────── */
(function swSelfHeal() {
  if (!('serviceWorker' in navigator)) return;
  const CURRENT = 'isc-v5';
  if (sessionStorage.getItem('sw-ok') === CURRENT) return;
  sessionStorage.setItem('sw-ok', CURRENT);
  navigator.serviceWorker.getRegistrations().then(regs => {
    const stale = regs.filter(r => {
      const sw = r.active || r.installing || r.waiting;
      return sw && !sw.scriptURL.includes('isc-v5');
    });
    if (stale.length) Promise.all(stale.map(r => r.unregister())).then(() => location.reload(true));
  });
})();

/* ─── Boot ────────────────────────────────────────────────────────────────── */
window.addEventListener('load', () => {
  const btn = document.getElementById('connectGoogleBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span style="font-size:1.1rem;">G</span> &nbsp;Loading\u2026'; }

  const dJs  = document.getElementById('diag-js');
  const dGis = document.getElementById('diag-gis');
  const dCid = document.getElementById('diag-cid-val');
  const dOrg = document.getElementById('diag-origin-val');
  if (dJs)  dJs.innerHTML  = 'JS: <span style="color:#22c55e;">\u2713 Loaded (isc-v5, modular)</span>';
  if (dCid) dCid.textContent = CLIENT_ID.slice(0, 20) + '\u2026';
  if (dOrg) dOrg.textContent = window.location.origin;

  const wait = setInterval(() => {
    if (window.google?.accounts?.oauth2) {
      clearInterval(wait);
      if (dGis) dGis.innerHTML = 'GIS: <span style="color:#22c55e;">\u2713 Ready</span>';
      if (btn) { btn.disabled = false; btn.innerHTML = '<span style="font-size:1.1rem;">G</span> &nbsp;Sign in with Google'; }
      init();
    }
  }, 100);

  setTimeout(() => {
    clearInterval(wait);
    if (!window.google?.accounts) {
      if (dGis) dGis.innerHTML = 'GIS: <span style="color:#ef4444;">\u2717 Failed to load</span>';
      if (btn)  { btn.disabled = false; btn.innerHTML = '<span style="font-size:1.1rem;">G</span> &nbsp;Sign in with Google'; }
      setStatus('connectStatus', 'Google services failed to load. Check your connection and refresh.', 'err');
    }
    init();
  }, 8000);
});

// Setup wizard events — avoids circular import between setup.js and app.js
window.addEventListener('setup-show-screen', () => show('screen-setup'));
window.addEventListener('setup-complete',    () => { show('screen-main'); initMain(); });
window.addEventListener('setup-go-welcome',  () => show('screen-welcome'));

registerServiceWorker();
