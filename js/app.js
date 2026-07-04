/* ═══════════════════════════════════════════════════════════════════════════
   Inventory Scanner — app.js
   All application logic in one well-structured file.
   Sections: SW Self-Heal → State → Router → Auth → Setup → Sheets API →
             Offline Queue → Scanner → Lookup → Submit → Inventory View →
             Low Stock → Audit Log → Boot
   ═══════════════════════════════════════════════════════════════════════════ */

'use strict';

/* ─── Service Worker Self-Healer ────────────────────────────────────────────
   On first load per session, checks for stale SWs and evicts them so
   GitHub Pages updates are never blocked by old cached content.            */
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
    if (stale.length) {
      Promise.all(stale.map(r => r.unregister()))
        .then(() => window.location.reload(true));
    }
  });
})();

/* ─── State ─────────────────────────────────────────────────────────────── */
// ─── Developer Client ID (hardcoded — users never see this) ────────────
const CLIENT_ID = '1003127305142-ucdql7nnag18sfkca159qi4v2nbaqiio.apps.googleusercontent.com';

const S = {
  sheetUrl:       localStorage.getItem('sheetUrl')      || '',
  spreadsheetId:  localStorage.getItem('spreadsheetId') || '',
  accessToken:    null,
  tokenTimer:     null,
  offlineQueue:   JSON.parse(localStorage.getItem('offlineQueue') || '[]'),
  minQty:         JSON.parse(localStorage.getItem('minQty')       || '{}'),
  inventoryCache: [],
  currentTab:     'scan',
};

/* ─── Utilities ─────────────────────────────────────────────────────────── */
function $(id)               { return document.getElementById(id); }
function setStatus(id, msg, type) {
  const el = $(id);
  if (el) el.innerHTML = msg
    ? `<div class="status ${type}">${msg}</div>`
    : '';
}
function saveQueue() {
  localStorage.setItem('offlineQueue', JSON.stringify(S.offlineQueue));
}

/* ─── Screen Router ─────────────────────────────────────────────────────── */
const SCREENS = ['screen-welcome','screen-setup','screen-main'];
function show(id) {
  SCREENS.forEach(s => $(s).classList.add('hidden'));
  $(id).classList.remove('hidden');
  // Show bottom nav only on main screen
  $('bottom-nav').style.display = id === 'screen-main' ? 'flex' : 'none';
}

function switchTab(tab) {
  S.currentTab = tab;
  $('tab-scan').classList.toggle('active', tab === 'scan');
  $('tab-inv').classList.toggle('active', tab === 'inv');
  $('pane-scan').classList.toggle('hidden', tab !== 'scan');
  $('pane-inv').classList.toggle('hidden',  tab !== 'inv');
  if (tab === 'inv') loadInventoryView();
}

/* ─── Init ──────────────────────────────────────────────────────────────── */
function init() {
  if (S.sheetUrl && !S.spreadsheetId) {
    const m = S.sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    if (m) { S.spreadsheetId = m[1]; localStorage.setItem('spreadsheetId', m[1]); }
  }
  if (S.spreadsheetId) { show('screen-main'); initMain(); return; }
  show('screen-welcome');
}

/* ─── Welcome Screen: Sign In ───────────────────────────────────────────────────────────────── */
$('connectGoogleBtn').addEventListener('click', () => {
  if (!window.google || !window.google.accounts || !window.google.accounts.oauth2) {
    setStatus('connectStatus', 'Still loading Google services — please wait a moment and try again.', 'warn');
    return;
  }
  const btn = $('connectGoogleBtn');
  btn.disabled = true;
  btn.innerHTML = 'Connecting…';
  setStatus('connectStatus', 'Opening Google sign-in…', 'info');
  try {
    requestToken(runFullSetup);
  } catch (e) {
    setStatus('connectStatus', 'Sign-in failed: ' + e.message, 'err');
    btn.disabled = false;
    btn.innerHTML = '<span style="font-size:1.1rem;">G</span> &nbsp;Sign in with Google';
  }
});

function resetSignInBtn() {
  const btn = $('connectGoogleBtn');
  if (btn) {
    btn.disabled = false;
    btn.innerHTML = '<span style="font-size:1.1rem;">G</span> &nbsp;Sign in with Google';
  }
}

function requestToken(callback) {
  try {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive',
      ].join(' '),
      callback: resp => {
        if (resp.error) {
          const msg = resp.error === 'popup_closed_by_user'
            ? 'Sign-in window was closed — tap the button again.'
            : resp.error === 'access_denied'
            ? 'Access was denied. Please allow the required permissions.'
            : 'Sign-in failed: ' + resp.error;
          setStatus('connectStatus', msg, 'err');
          resetSignInBtn();
          return;
        }
        S.accessToken = resp.access_token;
        scheduleTokenRefresh();
        callback();
      }
    });
    client.requestAccessToken({ prompt: 'consent' });
  } catch (e) {
    setStatus('connectStatus', 'Could not open sign-in: ' + e.message, 'err');
    resetSignInBtn();
  }
}

/* ─── Auth: Background Token Refresh ───────────────────────────────────── */
function scheduleTokenRefresh() {
  if (S.tokenTimer) clearTimeout(S.tokenTimer);
  // Refresh 10 minutes before the 60-min expiry — at 50 minutes
  S.tokenTimer = setTimeout(silentTokenRefresh, 50 * 60 * 1000);
}

function silentTokenRefresh() {
  const client = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive',
    ].join(' '),
    callback: resp => {
      if (!resp.error) {
        S.accessToken = resp.access_token;
        scheduleTokenRefresh(); // re-schedule for the next cycle
        console.log('[Auth] Token silently refreshed');
        flushOfflineQueue();    // good time to retry any queued items
      }
    }
  });
  client.requestAccessToken({ prompt: '' }); // '' = silent if possible
}

function ensureToken() {
  if (S.accessToken) return Promise.resolve();
  return new Promise(resolve => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive',
      ].join(' '),
      callback: resp => {
        if (!resp.error) { S.accessToken = resp.access_token; scheduleTokenRefresh(); }
        resolve();
      }
    });
    client.requestAccessToken({ prompt: '' });
  });
}

/* ─── Find Existing Sheet ───────────────────────────────────────────────── */
// Searches the user's Drive for an existing Inventory Scanner sheet.
// Called before createSheet() so re-authentication always reconnects
// to the same sheet rather than creating a new one.
async function findExistingSheet() {
  const q = encodeURIComponent(
    "name='Inventory Scanner — My Stock' " +
    "and mimeType='application/vnd.google-apps.spreadsheet' " +
    "and trashed=false"
  );
  const res = await fetch(
    'https://www.googleapis.com/drive/v3/files?q=' + q +
    '&fields=files(id,name,modifiedTime)&orderBy=modifiedTime%20desc&pageSize=1',
    { headers: { 'Authorization': 'Bearer ' + S.accessToken } }
  );
  if (!res.ok) return null;
  const data = await res.json();
  return (data.files && data.files.length > 0) ? data.files[0] : null;
}

/* ─── Setup Flow ────────────────────────────────────────────────────────── */
async function runFullSetup() {
  show('screen-setup');
  try {
    // Search for an existing sheet first. This ensures re-authentication
    // after token expiry or Reset always reconnects to the SAME sheet
    // instead of accidentally creating a new one.
    log('Looking for your existing sheet…', 20);
    const existing = await findExistingSheet();

    let spreadsheetId;
    if (existing) {
      spreadsheetId = existing.id;
      log('Reconnecting to your sheet…', 60);
      logLine('✓ Found your existing sheet');
    } else {
      log('Creating your Google Sheet…', 40);
      spreadsheetId = await createSheet();
      logLine('✓ Sheet created with formatting');
    }

    log('Finalising connection…', 90);
    const sheetUrl = 'https://docs.google.com/spreadsheets/d/' + spreadsheetId;
    localStorage.setItem('sheetUrl', sheetUrl);
    localStorage.setItem('spreadsheetId', spreadsheetId);
    S.sheetUrl      = sheetUrl;
    S.spreadsheetId = spreadsheetId;
    logLine('✓ App connected to your sheet');

    log('All done!', 100);
    setStatus('setupStatus',
      existing ? '✅ Reconnected to your existing sheet!' : '🎉 Your inventory system is ready!',
      'ok');
    setTimeout(() => { show('screen-main'); initMain(); }, 1500);

  } catch (e) {
    console.error('[Setup]', e);
    handleSetupError(e.message || '');
  }
}

function handleSetupError(msg) {
  if (msg.includes('401') || msg.includes('invalid_token') || msg.includes('Unauthorized')) {
    $('setupStep').textContent = 'Session expired.';
    $('setupStatus').innerHTML = `
      <div class="status err">Your Google session expired. Tap below to sign in again.</div>
      <button class="btn-primary" id="retryAuthBtn" style="margin-top:8px;">🔄 Sign In & Retry</button>`;
    $('retryAuthBtn').addEventListener('click', () => {
      $('setupLog').innerHTML = '';
      setStatus('setupStatus', '', '');
      requestToken(runFullSetup);
    });
    return;
  }
  $('setupStep').textContent = 'Something went wrong.';
  $('setupStatus').innerHTML = `
    <div class="status err">❌ ${msg || 'Unknown error'}</div>
    <button class="btn-secondary" id="retryGenBtn" style="margin-top:8px;">← Go Back & Retry</button>`;
  $('retryGenBtn').addEventListener('click', () => show('screen-welcome'));
}

function log(msg, pct) {
  $('setupStep').textContent = msg;
  $('progressFill').style.width = pct + '%';
}
function logLine(msg) {
  $('setupLog').innerHTML += msg + '<br>';
}

/* ─── Sheet Creation ────────────────────────────────────────────────────── */
async function createSheet() {
  const navy   = { red: 0, green: 0.125, blue: 0.376 };
  const white  = { red: 1, green: 1,     blue: 1     };
  const black  = { red: 0, green: 0,     blue: 0     };
  const grey   = { red: 0.6, green: 0.6, blue: 0.6   };
  const solid  = c => ({ style: 'SOLID', width: 1, color: c });
  const header = label => ({
    userEnteredValue:  { stringValue: label },
    userEnteredFormat: {
      backgroundColor: navy,
      textFormat: { bold: true, foregroundColor: white }
    }
  });

  // Create workbook with two sheets: Inventory + History (audit log)
  const res = await gapi('https://sheets.googleapis.com/v4/spreadsheets', 'POST', {
    properties: { title: 'Inventory Scanner — My Stock' },
    sheets: [
      {
        properties: { title: 'Inventory', sheetId: 0 },
        data: [{ startRow: 0, startColumn: 0, rowData: [{ values: [
          header('Barcode'), header('Description'), header('Quantity'),
          header('Unit'), header('Price'), header('Last Updated'),
          header('Min Qty'), header('Max Qty')
        ]}]}]
      },
      {
        properties: { title: 'History', sheetId: 1 },
        data: [{ startRow: 0, startColumn: 0, rowData: [{ values: [
          header('Timestamp'), header('Barcode'), header('Description'),
          header('Change'), header('New Qty'), header('Unit'), header('Price')
        ]}]}]
      }
    ]
  });

  const spreadsheetId = res.spreadsheetId;
  // Use sheetId from response to be safe (never assume 0/1)
  const invSheetId  = res.sheets[0].properties.sheetId;
  const histSheetId = res.sheets[1].properties.sheetId;

  // Apply all formatting in one batchUpdate
  await gapi(
    'https://sheets.googleapis.com/v4/spreadsheets/' + spreadsheetId + ':batchUpdate',
    'POST',
    { requests: [
      // ── Inventory sheet ──────────────────────────────────────────
      // Data rows: white bg, black text (applied BEFORE data arrives so
      // OVERWRITE-mode appends inherit this, not the navy header)
      { repeatCell: {
        range: { sheetId: invSheetId, startRowIndex: 1, endRowIndex: 5000, startColumnIndex: 0, endColumnIndex: 8 },
        cell: { userEnteredFormat: { backgroundColor: white, textFormat: { bold: false, foregroundColor: black } } },
        fields: 'userEnteredFormat(backgroundColor,textFormat)'
      }},
      // Barcode column: plain text format → preserves leading zeros
      { repeatCell: {
        range: { sheetId: invSheetId, startRowIndex: 1, endRowIndex: 5000, startColumnIndex: 0, endColumnIndex: 1 },
        cell: { userEnteredFormat: { numberFormat: { type: 'TEXT' } } },
        fields: 'userEnteredFormat.numberFormat'
      }},
      // Price column: currency format
      { repeatCell: {
        range: { sheetId: invSheetId, startRowIndex: 1, endRowIndex: 5000, startColumnIndex: 4, endColumnIndex: 5 },
        cell: { userEnteredFormat: { numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0.00' } } },
        fields: 'userEnteredFormat.numberFormat'
      }},
      // Borders: all cells in Inventory sheet
      { repeatCell: {
        range: { sheetId: invSheetId, startRowIndex: 0, endRowIndex: 5000, startColumnIndex: 0, endColumnIndex: 8 },
        cell: { userEnteredFormat: { borders: { top: solid(grey), bottom: solid(grey), left: solid(grey), right: solid(grey) } } },
        fields: 'userEnteredFormat.borders'
      }},
      // Freeze header row
      { updateSheetProperties: {
        properties: { sheetId: invSheetId, gridProperties: { frozenRowCount: 1 } },
        fields: 'gridProperties.frozenRowCount'
      }},
      // ── History sheet ────────────────────────────────────────────
      { repeatCell: {
        range: { sheetId: histSheetId, startRowIndex: 1, endRowIndex: 5000, startColumnIndex: 0, endColumnIndex: 7 },
        cell: { userEnteredFormat: { backgroundColor: white, textFormat: { bold: false, foregroundColor: black } } },
        fields: 'userEnteredFormat(backgroundColor,textFormat)'
      }},
      { repeatCell: {
        range: { sheetId: histSheetId, startRowIndex: 0, endRowIndex: 5000, startColumnIndex: 0, endColumnIndex: 7 },
        cell: { userEnteredFormat: { borders: { top: solid(grey), bottom: solid(grey), left: solid(grey), right: solid(grey) } } },
        fields: 'userEnteredFormat.borders'
      }},
      { updateSheetProperties: {
        properties: { sheetId: histSheetId, gridProperties: { frozenRowCount: 1 } },
        fields: 'gridProperties.frozenRowCount'
      }},
    ]}
  );
  return spreadsheetId;
}

/* ─── Sheets API Helpers ────────────────────────────────────────────────── */
async function gapi(url, method, body) {
  const res = await fetch(url, {
    method,
    headers: {
      'Authorization': 'Bearer ' + S.accessToken,
      'Content-Type':  'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json();
  if (!res.ok) {
    const msg = (data.error && data.error.message) || JSON.stringify(data);
    throw new Error(msg);
  }
  return data;
}

async function sheetsRead(spreadsheetId, range) {
  const res = await fetch(
    'https://sheets.googleapis.com/v4/spreadsheets/' + spreadsheetId
    + '/values/' + encodeURIComponent(range),
    { headers: { 'Authorization': 'Bearer ' + S.accessToken } }
  );
  if (res.status === 401) throw new Error('TOKEN_EXPIRED');
  if (!res.ok) throw new Error('Read failed ' + res.status);
  return res.json();
}

// Uses OVERWRITE so new rows land on the pre-formatted white/black cells
// instead of INSERT_ROWS which copies formatting from the row above.
async function sheetsAppend(spreadsheetId, sheetName, row) {
  const res = await fetch(
    'https://sheets.googleapis.com/v4/spreadsheets/' + spreadsheetId
    + '/values/' + encodeURIComponent(sheetName + '!A:Z')
    + ':append?valueInputOption=USER_ENTERED&insertDataOption=OVERWRITE',
    {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + S.accessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ majorDimension: 'ROWS', values: [row] })
    }
  );
  if (res.status === 401) throw new Error('TOKEN_EXPIRED');
  if (!res.ok) throw new Error('Append failed ' + res.status);
  return res.json();
}

async function sheetsBatchUpdate(spreadsheetId, data) {
  const res = await fetch(
    'https://sheets.googleapis.com/v4/spreadsheets/' + spreadsheetId + '/values:batchUpdate',
    {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + S.accessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data })
    }
  );
  if (res.status === 401) throw new Error('TOKEN_EXPIRED');
  if (!res.ok) throw new Error('Update failed ' + res.status);
  return res.json();
}

/* ─── Offline Queue ─────────────────────────────────────────────────────── */
function isOnline() { return navigator.onLine; }

function queueWrite(payload) {
  S.offlineQueue.push({ ...payload, queuedAt: new Date().toISOString() });
  saveQueue();
  updateOfflineBar();
}

async function flushOfflineQueue() {
  if (!isOnline() || !S.offlineQueue.length || !S.accessToken) return;
  const queue = [...S.offlineQueue];
  S.offlineQueue = [];
  saveQueue();
  let failed = [];
  for (const item of queue) {
    try {
      await writeToSheet(item, false); // false = don't re-queue on failure
    } catch (e) {
      console.warn('[Queue] Failed to flush item:', e.message);
      failed.push(item);
    }
  }
  if (failed.length) {
    S.offlineQueue = [...failed, ...S.offlineQueue];
    saveQueue();
  }
  updateOfflineBar();
  if ($('inv-count')) loadInventoryView(); // refresh list if visible
}

function updateOfflineBar() {
  const bar = $('offline-bar');
  if (!bar) return;
  if (!isOnline()) {
    bar.textContent = '📡 You are offline — changes will sync when connection returns';
    bar.style.display = 'block';
  } else if (S.offlineQueue.length) {
    bar.textContent = `⏳ Syncing ${S.offlineQueue.length} queued item(s)…`;
    bar.style.display = 'block';
  } else {
    bar.style.display = 'none';
  }
}

window.addEventListener('online',  () => { updateOfflineBar(); flushOfflineQueue(); });
window.addEventListener('offline', () => updateOfflineBar());

/* ─── Core Write Logic ──────────────────────────────────────────────────── */
async function writeToSheet(payload, allowQueue = true) {
  const { spreadsheetId, barcode, description, qtyChange, unit, price, timestamp } = payload;

  if (!isOnline()) {
    if (allowQueue) queueWrite(payload);
    return { queued: true };
  }

  const sheetData = await sheetsRead(spreadsheetId, 'Inventory!A:H');
  const rows = sheetData.values || [[]];

  let rowIndex = -1;
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0] || '').trim() === barcode) { rowIndex = i; break; }
  }

  let newQty;
  if (rowIndex === -1) {
    // New item
    newQty = Math.max(qtyChange, 0);
    const t = getThreshold(barcode);
    await sheetsAppend(spreadsheetId, 'Inventory', [
      barcode, description, newQty, unit,
      price !== '' ? parseFloat(price) : '', timestamp,
      t.min || '', t.max || ''
    ]);
  } else {
    // Existing item
    const currentQty = Number(rows[rowIndex][2]) || 0;
    newQty = Math.max(currentQty + qtyChange, 0);
    const r = rowIndex + 1;
    const updates = [
      { range: 'Inventory!C' + r, values: [[newQty]] },
      { range: 'Inventory!F' + r, values: [[timestamp]] }
    ];
    if (description && !rows[rowIndex][1]) updates.push({ range: 'Inventory!B' + r, values: [[description]] });
    if (unit       && !rows[rowIndex][3]) updates.push({ range: 'Inventory!D' + r, values: [[unit]] });
    if (price !== '' && !rows[rowIndex][4]) updates.push({ range: 'Inventory!E' + r, values: [[parseFloat(price)]] });
    // Sync threshold columns G/H so sheet always reflects app settings
    const t = getThreshold(barcode);
    updates.push({ range: 'Inventory!G' + r, values: [[t.min || '']] });
    updates.push({ range: 'Inventory!H' + r, values: [[t.max || '']] });
    await sheetsBatchUpdate(spreadsheetId, updates);
  }

  // Write audit log entry to History sheet
  try {
    const changeLabel = (qtyChange > 0 ? '+' : '') + qtyChange;
    await sheetsAppend(spreadsheetId, 'History', [
      timestamp, barcode, description, changeLabel, newQty, unit,
      price !== '' ? parseFloat(price) : ''
    ]);
  } catch (e) {
    console.warn('[Audit] History write skipped:', e.message);
  }

  return { newQty };
}

/* ─── Submit Handler ────────────────────────────────────────────────────── */
async function submitChange(direction, isRetry) {
  const spreadsheetId = S.spreadsheetId;
  const barcode     = $('barcode').value.trim();
  const description = $('description').value.trim();
  const qty         = parseInt($('qty').value, 10) || 0;

  if (!barcode)       { setStatus('result', 'Scan or enter a barcode first.', 'err'); return; }
  if (!spreadsheetId) { setStatus('result', 'Not connected — use Reset & Reconnect in Settings.', 'err'); return; }

  if (!S.accessToken) {
    setStatus('result', 'Signing in…', 'info');
    await ensureToken();
  }

  const unitSel = $('unit');
  const unit    = unitSel.value === 'custom'
    ? ($('unitCustom').value.trim() || 'ea')
    : unitSel.value;
  const price     = $('price').value.trim();
  const qtyChange = direction === 'add' ? qty : -qty;
  const timestamp = new Date().toLocaleString();

  const payload = { spreadsheetId, barcode, description, qtyChange, unit, price, timestamp };

  if (!isOnline()) {
    queueWrite(payload);
    setStatus('result', '📡 Offline — change queued and will sync automatically.', 'warn');
    updateOfflineBar();
    return;
  }

  setStatus('result', 'Saving…', 'info');
  try {
    const result = await writeToSheet(payload);
    if (result.queued) {
      setStatus('result', '📡 Queued — will sync when connection returns.', 'warn');
    } else {
      const sign = direction === 'add' ? '✅ +' : '✅ −';
      setStatus('result', `${sign}${qty} — Stock: ${result.newQty}`, 'ok');
      S.inventoryCache = []; // invalidate cache so next list view refreshes
      updateLowStockBadge();
    }
  } catch (e) {
    if (e.message === 'TOKEN_EXPIRED' && !isRetry) {
      setStatus('result', 'Session expired — refreshing…', 'info');
      S.accessToken = null;
      await ensureToken();
      submitChange(direction, true);
    } else {
      setStatus('result', '❌ ' + e.message, 'err');
    }
  }
}

$('addBtn').addEventListener('click', () => submitChange('add'));
$('subBtn').addEventListener('click', () => submitChange('subtract'));

/* ─── Main Screen Init ──────────────────────────────────────────────────── */
// ─── Smart Sheet Opener ─────────────────────────────────────────────────────
// On Android: tries intent:// URL which opens the Sheets app directly if
// installed, and falls back to the browser URL if not.
// On iOS: uses the regular URL — universal links open Sheets app automatically.
// Desktop: opens a new browser tab.
function openSheet(e) {
  e.preventDefault();
  const url = S.sheetUrl;
  if (!url) return;

  const ua = navigator.userAgent || '';
  const isAndroid = /android/i.test(ua);

  if (isAndroid && S.spreadsheetId) {
    // intent:// URL opens the Sheets app directly on Android Chrome.
    // S.browser_fallback_url ensures a graceful web fallback if not installed.
    const fallback = encodeURIComponent(url);
    const intent = 'intent://spreadsheets/d/' + S.spreadsheetId +
      '#Intent' +
      ';package=com.google.android.apps.sheets' +
      ';scheme=https' +
      ';host=docs.google.com' +
      ';S.browser_fallback_url=' + fallback +
      ';end';
    window.location.href = intent;
    return;
  }

  // iOS universal links and desktop — regular URL handled by OS/browser
  window.open(url, '_blank', 'noopener');
}

function initMain() {
  // Make sheet links use the smart opener instead of plain href
  [$('sheetLink'), $('sheetLinkFull')].forEach(el => {
    if (!el) return;
    el.href = S.sheetUrl || '#';
    el.addEventListener('click', openSheet);
  });

  $('resetBtn').addEventListener('click', () => {
    // Re-authenticate keeps the same sheet — use 'Start fresh' for a new one
    if (confirm('Re-authenticate with Google?\n\nThis will sign you back in and reconnect to your existing sheet. Your data is safe.')) {
      S.accessToken = null;
      // Keep sheetUrl + spreadsheetId so we reconnect, not recreate
      location.reload();
    }
  });

  $('freshBtn').addEventListener('click', () => {
    if (confirm('Start fresh?\n\nThis disconnects from your current sheet. You can always reconnect by signing in again — your old sheet stays in Google Drive.')) {
      ['sheetUrl','spreadsheetId','offlineQueue','minQty'].forEach(k => localStorage.removeItem(k));
      location.reload();
    }
  });

  $('tab-scan').addEventListener('click', () => switchTab('scan'));
  $('tab-inv').addEventListener('click',  () => switchTab('inv'));

  updateOfflineBar();
  updateLowStockBadge();
  flushOfflineQueue();
  scheduleTokenRefresh();
}

/* ─── Camera & Barcode Scanner ──────────────────────────────────────────── */
let stream = null, scanning = false, detector = null;
let lastCode = null, codeCount = 0, missCount = 0;
const CONFIRM_READS = 3;
const MISS_TOLERANCE = 5;

$('scanBtn').addEventListener('click', () => {
  if (scanning) { stopScan(); $('scanBtn').textContent = '📷 Scan Barcode'; }
  else          { startScan(); $('scanBtn').textContent = '⏹ Stop Scanning'; }
});

async function startScan() {
  if (!('BarcodeDetector' in window)) {
    setStatus('cameraStatus', 'Live scanning requires Chrome on Android. You can type barcodes manually below.', 'warn');
    return;
  }
  try {
    detector = new BarcodeDetector({ formats: ['ean_13','ean_8','upc_a','upc_e','code_128','qr_code'] });
    stream   = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
    });
    $('video').srcObject = stream;
    $('video-wrap').style.display = 'block';
    scanning = true;
    lastCode = null; codeCount = 0; missCount = 0;
    requestAnimationFrame(scanLoop);
  } catch (e) { setStatus('cameraStatus', 'Camera failed: ' + e.message, 'err'); }
}

function stopScan() {
  scanning = false;
  if (stream) stream.getTracks().forEach(t => t.stop());
  $('video-wrap').style.display = 'none';
}

async function scanLoop() {
  if (!scanning) return;
  try {
    const codes = await detector.detect($('video'));
    if (codes.length > 0) {
      const code = codes[0].rawValue;
      const fmt  = codes[0].format || '';

      // Length validation — rejects nearby printed numbers
      const digits = code.replace(/\D/g, '').length;
      const expectedLengths = { ean_13: 13, ean_8: 8, upc_a: 12, upc_e: 8 };
      if (expectedLengths[fmt] && digits !== expectedLengths[fmt]) {
        requestAnimationFrame(scanLoop);
        return;
      }

      missCount = 0;
      if (code !== lastCode) { hideVendorPanel(); } // clear old results when new barcode detected
      if (code === lastCode) { codeCount++; }
      else                   { lastCode = code; codeCount = 1; }

      const pct = Math.round((codeCount / CONFIRM_READS) * 100);
      setStatus('cameraStatus', `Hold steady… ${pct}%`, 'info');

      if (codeCount >= CONFIRM_READS) {
        lastCode = null; codeCount = 0; missCount = 0;
        $('barcode').value = code;
        stopScan();
        $('scanBtn').textContent = '📷 Scan Barcode';
        setStatus('cameraStatus', `Scanned: ${code} (${fmt || 'barcode'}) — looking up…`, 'info');
        lookupBarcode(code);
        return;
      }
    } else {
      missCount++;
      if (missCount > MISS_TOLERANCE) { lastCode = null; codeCount = 0; missCount = 0; }
    }
  } catch (e) { /* frame failed, keep looping */ }
  requestAnimationFrame(scanLoop);
}

/* ─── Barcode Lookup ────────────────────────────────────────────────────── */
$('barcode').addEventListener('change', () => {
  const v = $('barcode').value.trim();
  if (v) lookupBarcode(v);
});

$('unit').addEventListener('change', function () {
  $('unitCustom').style.display = this.value === 'custom' ? 'block' : 'none';
});

async function lookupBarcode(code) {
  let found = false;
  try {
    const res  = await fetch('https://world.openfoodfacts.org/api/v2/product/' + code + '.json');
    const data = await res.json();
    if (data.status === 1 && data.product) {
      const p = data.product;
      const name = p.product_name || p.generic_name || '';
      if (name) { $('description').value = name; found = true; }

      // Parse unit from quantity string e.g. "330 ml", "500g", "12 x 35g"
      if (p.quantity) {
        const m = p.quantity.match(/\b(ml|mL|L|l|g|kg|oz|lb|fl\s?oz|cl)\b/);
        if (m) {
          const u = m[1].replace(/\s/, '').toLowerCase();
          const sel = $('unit');
          const opt = [...sel.options].find(o => o.value.toLowerCase() === u);
          if (opt)  { sel.value = opt.value; }
          else      { sel.value = 'custom'; $('unitCustom').style.display = 'block'; $('unitCustom').value = m[1]; }
        }
      }
    }

    // Price from Open Food Facts Prices API (crowdsourced averages)
    try {
      const pr = await fetch('https://prices.openfoodfacts.org/api/v1/prices?product_code=' + code + '&page_size=10');
      const pd = await pr.json();
      if (pd.items && pd.items.length) {
        const prices = pd.items.map(i => parseFloat(i.price)).filter(p => p > 0);
        if (prices.length) {
          const avg = (prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(2);
          $('price').value = avg;
          $('priceTag').textContent = '(estimated avg — edit freely)';
          found = true;
        }
      }
    } catch (e) { /* price lookup best-effort */ }

    setStatus('cameraStatus', found
      ? 'Found public data — review and adjust before saving.'
      : 'No public match — fill in the details below.', found ? 'ok' : 'info');

    // Trigger vendor price lookup in parallel (non-blocking)
    const productName = $('description').value.trim();
    lookupVendorPrices(code, productName).catch(() => {});

  } catch (e) {
    setStatus('cameraStatus', 'Lookup failed — fill in details manually.', 'warn');
  }
}

/* ─── Vendor Price Lookup ───────────────────────────────────────────────── */
// Uses UPCitemdb free trial API — 100 lookups/day, no key required.
// Results cached in sessionStorage so repeated scans of the same barcode
// don't burn through the daily limit.
async function lookupVendorPrices(barcode, productName) {
  const panel  = $('vendor-panel');
  const list   = $('vendor-list');
  const status = $('vendor-status');
  const shopLink = $('vendor-shop-link');
  if (!panel) return;

  panel.style.display = 'block';
  list.innerHTML = '<div style="padding:10px;color:var(--muted);font-size:0.8rem;">Searching vendors…</div>';
  if (status) status.textContent = '';

  // Build Google Shopping fallback link using product name or barcode
  const searchQ = encodeURIComponent(productName || barcode);
  if (shopLink) shopLink.href = 'https://www.google.com/search?tbm=shop&q=' + searchQ;

  // Check sessionStorage cache first
  const cacheKey = 'vp_' + barcode;
  const cached = sessionStorage.getItem(cacheKey);
  if (cached) {
    renderVendorOffers(JSON.parse(cached), list, status, barcode);
    return;
  }

  try {
    const res  = await fetch('https://api.upcitemdb.com/prod/trial/lookup?upc=' + barcode);
    const data = await res.json();

    if (data.code && data.code !== 'OK') {
      list.innerHTML = '<div style="padding:10px;color:var(--muted);font-size:0.8rem;">No vendor data — try the search link above.</div>';
      return;
    }

    const item   = (data.items || [])[0] || {};
    const offers = (item.offers || [])
      .filter(o => parseFloat(o.price) > 0)
      .map(o => ({
        merchant:  o.merchant || 'Unknown',
        price:     parseFloat(o.price),
        shipping:  parseFloat(o.shipping) || 0,
        total:     parseFloat(o.price) + (parseFloat(o.shipping) || 0),
        condition: o.condition || 'new',
        link:      o.link || null,
      }))
      .sort((a, b) => a.total - b.total)
      .slice(0, 8);

    sessionStorage.setItem(cacheKey, JSON.stringify(offers));
    renderVendorOffers(offers, list, status, barcode);

  } catch (e) {
    list.innerHTML = '<div style="padding:10px;color:var(--muted);font-size:0.8rem;">Vendor lookup failed — check connection or try the search link above.</div>';
  }
}

function renderVendorOffers(offers, list, status, barcode) {
  if (!offers || !offers.length) {
    list.innerHTML = '<div style="padding:10px;color:var(--muted);font-size:0.8rem;">No vendor listings found — try the search link above.</div>';
    return;
  }

  list.innerHTML = offers.map((o, i) => {
    const freeShip = o.shipping === 0 ? '<span class="vendor-item-ship">free ship</span>' : (o.shipping > 0 ? '<span class="vendor-item-ship">+$' + o.shipping.toFixed(2) + ' ship</span>' : '');
    return `
      <div class="vendor-item${i === 0 ? ' vendor-best' : ''}" onclick="selectVendorPrice(${o.price}, '${o.merchant.replace(/'/g,"\'")}')">
        <span class="vendor-item-name">${i === 0 ? '🏆 ' : ''}${o.merchant}</span>
        <span class="vendor-item-cond">${o.condition}</span>
        <div style="text-align:right;">
          <span class="vendor-item-price">$${o.price.toFixed(2)}</span>
          ${freeShip}
        </div>
      </div>`;
  }).join('');

  if (status) status.textContent = offers.length + ' vendor' + (offers.length !== 1 ? 's' : '') + ' found · sorted cheapest first';
}

function selectVendorPrice(price, merchant) {
  const priceInput = $('price');
  if (priceInput) priceInput.value = price.toFixed(2);
  const priceTag = $('priceTag');
  if (priceTag) priceTag.textContent = '(from ' + merchant + ')';
}

function hideVendorPanel() {
  const panel = $('vendor-panel');
  if (panel) panel.style.display = 'none';
  const list = $('vendor-list');
  if (list) list.innerHTML = '';
}

/* ─── Inventory List View ───────────────────────────────────────────────── */
async function loadInventoryView() {
  if (!S.spreadsheetId || !S.accessToken) return;
  $('inv-loading').style.display = 'block';
  $('inv-list').innerHTML = '';
  try {
    const data = await sheetsRead(S.spreadsheetId, 'Inventory!A:H');
    const rows = (data.values || []).slice(1); // skip header
    S.inventoryCache = rows;

    // Sync min/max thresholds from sheet columns G (index 6) and H (index 7)
    // Sheet is the source of truth — this keeps all devices in sync
    rows.forEach(r => {
      const barcode = String(r[0]||'').trim();
      if (!barcode) return;
      const sheetMin = parseInt(r[6]) || 0;
      const sheetMax = parseInt(r[7]) || 0;
      if (sheetMin > 0 || sheetMax > 0) {
        S.minQty[barcode] = { min: sheetMin, max: sheetMax };
      }
    });
    localStorage.setItem('minQty', JSON.stringify(S.minQty));

    renderInventoryList(rows, $('inv-search').value.trim().toLowerCase());
    updateLowStockBadge();
  } catch (e) {
    if (e.message === 'TOKEN_EXPIRED') {
      await ensureToken();
      loadInventoryView();
    } else {
      $('inv-list').innerHTML = `<div class="inv-empty">Could not load: ${e.message}</div>`;
    }
  } finally {
    $('inv-loading').style.display = 'none';
  }
}

function getThreshold(barcode) {
  const t = S.minQty[barcode];
  if (!t) return { min: 0, max: 0 };
  if (typeof t === 'object') return { min: t.min || 0, max: t.max || 0 };
  return { min: t, max: 0 }; // legacy number format
}

function renderInventoryList(rows, filter) {
  const list = $('inv-list');
  const filtered = rows.filter(r => {
    if (!filter) return true;
    return (String(r[0]||'') + String(r[1]||'')).toLowerCase().includes(filter);
  });

  if (!filtered.length) {
    list.innerHTML = '<div class="inv-empty">No items found</div>';
    return;
  }

  // Sort: low stock first, then alphabetical
  filtered.sort((a, b) => {
    const aqty = Number(a[2]) || 0, bqty = Number(b[2]) || 0;
    const at = getThreshold(String(a[0]||'')), bt = getThreshold(String(b[0]||''));
    const aLow = at.min > 0 && aqty <= at.min;
    const bLow = bt.min > 0 && bqty <= bt.min;
    if (aLow && !bLow) return -1;
    if (!aLow && bLow) return 1;
    return String(a[1]||a[0]).localeCompare(String(b[1]||b[0]));
  });

  list.innerHTML = filtered.map(r => {
    const barcode = String(r[0] || '');
    const name    = String(r[1] || barcode || '—');
    const qty     = Number(r[2]) || 0;
    const unit    = String(r[3] || '');
    const t       = getThreshold(barcode);
    const isLow   = t.min > 0 && qty <= t.min;
    const isMax   = t.max > 0 && qty >= t.max;
    const reorder = (t.min > 0 && t.max > 0 && isLow) ? (t.max - qty) : null;

    let badge = '';
    if (isLow)       badge = ' <span style="color:var(--red);font-size:0.72rem;">⚠ Reorder</span>';
    else if (isMax)  badge = ' <span style="color:var(--accent);font-size:0.72rem;">✓ Full</span>';

    const thresholdInfo = [];
    if (t.min > 0) thresholdInfo.push('min ' + t.min);
    if (t.max > 0) thresholdInfo.push('max ' + t.max);
    if (reorder !== null && reorder > 0) thresholdInfo.push('order ' + reorder + ' to restock');
    const sub = barcode + (thresholdInfo.length ? ' · ' + thresholdInfo.join(' / ') : '');

    return [
      '<div class="inv-item' + (isLow ? ' low-item' : '') + '" data-barcode="' + barcode + '"',
      ' onclick="openMinQtyModal(\'' + barcode + '\',\'' + name.replace(/\'/g, "\\\'") + '\',' + qty + ',' + t.min + ')">',
      '<div class="inv-item-left">',
      '<div class="inv-item-name">' + name + badge + '</div>',
      '<div class="inv-item-bc">' + sub + '</div>',
      '</div>',
      '<div class="inv-item-right">',
      '<div class="inv-item-qty' + (isLow ? ' low' : '') + '">' + qty + '</div>',
      '<div class="inv-item-unit">' + unit + '</div>',
      '</div></div>'
    ].join('');
  }).join('');

  $('inv-count').textContent = filtered.length + ' item' + (filtered.length !== 1 ? 's' : '');
}

$('inv-search').addEventListener('input', function () {
  renderInventoryList(S.inventoryCache, this.value.trim().toLowerCase());
});

$('inv-refresh').addEventListener('click', () => {
  S.inventoryCache = [];
  loadInventoryView();
});

/* ─── Low Stock Alerts ──────────────────────────────────────────────────── */
function updateLowStockBadge() {
  const count = S.inventoryCache.filter(r => {
    const t = getThreshold(String(r[0]||''));
    return t.min > 0 && (Number(r[2]) || 0) <= t.min;
  }).length;
  const badge = $('low-stock-badge');
  if (badge) {
    badge.textContent = count;
    badge.style.display = count > 0 ? 'inline-flex' : 'none';
  }
}

/* ─── Min Qty Modal ─────────────────────────────────────────────────────── */
function openMinQtyModal(barcode, name, qty, currentMin) {
  const existing = document.querySelector('.modal-backdrop');
  if (existing) existing.remove();

  const thresholds = S.minQty[barcode] || {};
  const curMin = typeof thresholds === 'object' ? (thresholds.min || 0) : (thresholds || 0);
  const curMax = typeof thresholds === 'object' ? (thresholds.max || 0) : 0;

  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-title">${name}</div>
      <div class="modal-sub">Barcode: ${barcode} · Current stock: ${qty}</div>

      <label>Reorder alert — alert when stock falls to or below:</label>
      <input id="minQtyInput" type="number" min="0" value="${curMin}" placeholder="0 = no alert">

      <label style="margin-top:10px;">Maximum stock — order up to this level:</label>
      <input id="maxQtyInput" type="number" min="0" value="${curMax}" placeholder="0 = no maximum">

      <div id="threshold-hint" style="font-size:0.72rem;color:var(--muted);margin-top:6px;line-height:1.5;"></div>

      <div class="row" style="margin-top:12px;">
        <button class="btn-secondary btn-sm" onclick="this.closest('.modal-backdrop').remove()">Cancel</button>
        <button class="btn-green btn-sm" onclick="saveThreshold('${barcode}', $('minQtyInput').value, $('maxQtyInput').value)">Save</button>
      </div>
    </div>`;
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);

  // Live hint as user types
  const updateHint = () => {
    const min = parseInt($('minQtyInput').value, 10) || 0;
    const max = parseInt($('maxQtyInput').value, 10) || 0;
    const hint = $('threshold-hint');
    if (!hint) return;
    const parts = [];
    if (min > 0) parts.push('Alert fires when stock ≤ ' + min);
    if (max > 0 && min > 0) parts.push('Reorder quantity: ' + (max - min) + ' units (to reach max)');
    else if (max > 0) parts.push('Max capacity: ' + max + ' units');
    hint.textContent = parts.join(' · ');
  };
  $('minQtyInput').addEventListener('input', updateHint);
  $('maxQtyInput').addEventListener('input', updateHint);
  updateHint();
  $('minQtyInput').focus();
}

// Writes min/max threshold directly to sheet columns G and H.
// Called from saveThreshold so the sheet is always the source of truth.
async function writeThresholdToSheet(barcode, min, max) {
  if (!S.spreadsheetId) return;
  try {
    await ensureToken();
    const data = await sheetsRead(S.spreadsheetId, 'Inventory!A:A');
    const rows = (data.values || []);
    let rowIndex = -1;
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]||'').trim() === barcode) { rowIndex = i + 1; break; }
    }
    if (rowIndex === -1) return; // not in sheet yet — columns G/H written on next stock scan
    await sheetsBatchUpdate(S.spreadsheetId, [
      { range: 'Inventory!G' + rowIndex, values: [[min > 0 ? min : '']] },
      { range: 'Inventory!H' + rowIndex, values: [[max > 0 ? max : '']] }
    ]);
    console.log('[Threshold] Written to sheet row', rowIndex);
  } catch (e) {
    console.warn('[Threshold] Sheet write failed (saved locally):', e.message);
  }
}

function saveThreshold(barcode, minVal, maxVal) {
  const min = parseInt(minVal, 10) || 0;
  const max = parseInt(maxVal, 10) || 0;
  if (min > 0 || max > 0) {
    S.minQty[barcode] = { min, max };
  } else {
    delete S.minQty[barcode];
  }
  localStorage.setItem('minQty', JSON.stringify(S.minQty));
  document.querySelector('.modal-backdrop')?.remove();
  renderInventoryList(S.inventoryCache, $('inv-search').value.trim().toLowerCase());
  updateLowStockBadge();
  // Write to sheet in background — non-blocking so UI stays responsive
  writeThresholdToSheet(barcode, min, max).catch(e => console.warn('[Threshold]', e.message));
}

// Keep backward compat alias
function saveMinQty(b, v) { saveThreshold(b, v, 0); }

/* ─── Boot ──────────────────────────────────────────────────────────────── */
window.addEventListener('load', () => {
  // ── Diagnostics ─────────────────────────────────────────────────────────
  function diag(id, msg, color) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = msg;
    if (color && el) el.style.color = color;
  }
  function diagSet(selector, val) {
    const el = document.getElementById(selector);
    if (el) el.textContent = val;
  }

  // JS loaded
  diag('diag-js', 'JS: <span style="color:#22c55e;">✓ Loaded (v isc-v5)</span>');
  diagSet('diag-origin-val', window.location.origin);
  diagSet('diag-cid-val', CLIENT_ID.slice(0,20) + '…');
  // ── End diagnostics ──────────────────────────────────────────────────────

  const btn = $('connectGoogleBtn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span style="font-size:1.1rem;">G</span> &nbsp;Loading…';
  }

  const wait = setInterval(() => {
    if (window.google && window.google.accounts && window.google.accounts.oauth2) {
      clearInterval(wait);
      diag('diag-gis', 'GIS: <span style="color:#22c55e;">✓ Ready</span>');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<span style="font-size:1.1rem;">G</span> &nbsp;Sign in with Google';
      }
      init();
    }
  }, 100);

  setTimeout(() => {
    clearInterval(wait);
    if (!window.google || !window.google.accounts) {
      diag('diag-gis', 'GIS: <span style="color:#ef4444;">✗ Failed to load</span>');
      const errEl = document.getElementById('diag-error');
      if (errEl) { errEl.style.display='block'; errEl.textContent = 'Google Identity Services script did not load. Check internet connection.'; }
      if (btn) { btn.disabled = false; btn.innerHTML = '<span style="font-size:1.1rem;">G</span> &nbsp;Sign in with Google'; }
      setStatus('connectStatus', 'Google services failed to load. Check your connection and refresh.', 'err');
    }
    init();
  }, 8000);
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./service-worker.js')
    .then(() => console.log('[SW] Registered'))
    .catch(e  => console.log('[SW] Failed:', e));
}