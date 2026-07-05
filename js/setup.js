/**
 * setup.js — First-run sheet creation and setup wizard UI.
 * No circular imports — communicates back to app.js via custom DOM events:
 *   'setup-complete'    → show main screen and init
 *   'setup-go-welcome'  → return to welcome screen
 */

import { S }                from './state.js';
import { $, setStatus }     from './utils.js';
import { gapi }             from './api.js';
import { requestToken }     from './auth.js';

/** Search the user's Drive for an existing Inventory Scanner sheet. */
export async function findExistingSheet() {
  const q = encodeURIComponent(
    "name='Inventory Scanner \u2014 My Stock' "
    + "and mimeType='application/vnd.google-apps.spreadsheet' "
    + "and trashed=false"
  );
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}`
    + '&fields=files(id,name,modifiedTime)&orderBy=modifiedTime%20desc&pageSize=1',
    { headers: { 'Authorization': 'Bearer ' + S.accessToken } }
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data.files?.length ? data.files[0] : null;
}

/** Main setup flow — called after successful sign-in. */
export async function runFullSetup() {
  // Dispatch to app.js to show the setup screen (avoids circular import)
  window.dispatchEvent(new CustomEvent('setup-show-screen'));
  try {
    const forceNew = sessionStorage.getItem('force-new-sheet') === '1';
    sessionStorage.removeItem('force-new-sheet');

    let spreadsheetId;
    if (forceNew) {
      log('Creating a new Google Sheet\u2026', 40);
      spreadsheetId = await createSheet();
      logLine('\u2713 New sheet created with formatting');
    } else {
      log('Looking for your existing sheet\u2026', 20);
      const existing = await findExistingSheet();
      if (existing) {
        spreadsheetId = existing.id;
        log('Reconnecting to your sheet\u2026', 60);
        logLine('\u2713 Found your existing sheet');
      } else {
        log('Creating your Google Sheet\u2026', 40);
        spreadsheetId = await createSheet();
        logLine('\u2713 Sheet created with formatting');
      }
    }

    log('Finalising connection\u2026', 90);
    const sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
    localStorage.setItem('sheetUrl', sheetUrl);
    localStorage.setItem('spreadsheetId', spreadsheetId);
    S.sheetUrl      = sheetUrl;
    S.spreadsheetId = spreadsheetId;
    logLine('\u2713 App connected to your sheet');

    log('All done!', 100);
    setStatus('setupStatus', '\ud83c\udf89 Ready!', 'ok');
    // Tell app.js setup finished — it will show the main screen
    setTimeout(() => window.dispatchEvent(new CustomEvent('setup-complete')), 1500);

  } catch (e) {
    console.error('[Setup]', e);
    handleSetupError(e.message || '');
  }
}

function handleSetupError(msg) {
  if ($('setupStep')) $('setupStep').textContent = 'Something went wrong.';
  if (msg.includes('401') || msg.includes('TOKEN_EXPIRED') || msg.includes('Unauthorized')) {
    if ($('setupStatus')) $('setupStatus').innerHTML = `
      <div class="status err">Session expired. Tap below to sign in again.</div>
      <button class="btn-primary" id="retryAuthBtn" style="margin-top:8px;">\ud83d\udd04 Sign In & Retry</button>`;
    document.getElementById('retryAuthBtn')?.addEventListener('click', () => {
      if ($('setupLog')) $('setupLog').innerHTML = '';
      setStatus('setupStatus', '', '');
      requestToken(runFullSetup);
    });
  } else {
    if ($('setupStatus')) $('setupStatus').innerHTML = `
      <div class="status err">\u274c ${msg || 'Unknown error'}</div>
      <button class="btn-secondary" id="retryGenBtn" style="margin-top:8px;">\u2190 Go Back & Retry</button>`;
    document.getElementById('retryGenBtn')?.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('setup-go-welcome'));
    });
  }
}

function log(msg, pct) {
  if ($('setupStep'))    $('setupStep').textContent = msg;
  if ($('progressFill')) $('progressFill').style.width = pct + '%';
}
function logLine(msg) {
  if ($('setupLog')) $('setupLog').innerHTML += msg + '<br>';
}

async function createSheet() {
  const navy  = { red: 0, green: 0.125, blue: 0.376 };
  const white = { red: 1, green: 1,     blue: 1     };
  const black = { red: 0, green: 0,     blue: 0     };
  const grey  = { red: 0.6, green: 0.6, blue: 0.6   };
  const solid = c => ({ style: 'SOLID', width: 1, color: c });
  const hdr   = label => ({
    userEnteredValue:  { stringValue: label },
    userEnteredFormat: { backgroundColor: navy, textFormat: { bold: true, foregroundColor: white } },
  });

  const res = await gapi('https://sheets.googleapis.com/v4/spreadsheets', 'POST', {
    properties: { title: 'Inventory Scanner \u2014 My Stock' },
    sheets: [
      { properties: { title: 'Inventory', sheetId: 0 },
        data: [{ startRow: 0, startColumn: 0, rowData: [{ values: [
          hdr('Barcode'), hdr('Description'), hdr('Quantity'),
          hdr('Unit'), hdr('Price'), hdr('Last Updated'), hdr('Min Qty'), hdr('Max Qty'),
        ]}]}] },
      { properties: { title: 'History', sheetId: 1 },
        data: [{ startRow: 0, startColumn: 0, rowData: [{ values: [
          hdr('Timestamp'), hdr('Barcode'), hdr('Description'),
          hdr('Change'), hdr('New Qty'), hdr('Unit'), hdr('Price'),
        ]}]}] },
    ],
  });

  const spreadsheetId = res.spreadsheetId;
  const invId  = res.sheets[0].properties.sheetId;
  const histId = res.sheets[1].properties.sheetId;

  await gapi(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    'POST',
    { requests: [
      { repeatCell: { range: { sheetId: invId, startRowIndex: 1, endRowIndex: 5000, startColumnIndex: 0, endColumnIndex: 8 },
        cell: { userEnteredFormat: { backgroundColor: white, textFormat: { bold: false, foregroundColor: black } } },
        fields: 'userEnteredFormat(backgroundColor,textFormat)' } },
      { repeatCell: { range: { sheetId: invId, startRowIndex: 1, endRowIndex: 5000, startColumnIndex: 0, endColumnIndex: 1 },
        cell: { userEnteredFormat: { numberFormat: { type: 'TEXT' } } },
        fields: 'userEnteredFormat.numberFormat' } },
      { repeatCell: { range: { sheetId: invId, startRowIndex: 1, endRowIndex: 5000, startColumnIndex: 4, endColumnIndex: 5 },
        cell: { userEnteredFormat: { numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0.00' } } },
        fields: 'userEnteredFormat.numberFormat' } },
      { repeatCell: { range: { sheetId: invId, startRowIndex: 0, endRowIndex: 5000, startColumnIndex: 0, endColumnIndex: 8 },
        cell: { userEnteredFormat: { borders: { top: solid(grey), bottom: solid(grey), left: solid(grey), right: solid(grey) } } },
        fields: 'userEnteredFormat.borders' } },
      { updateSheetProperties: { properties: { sheetId: invId, gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' } },
      { repeatCell: { range: { sheetId: histId, startRowIndex: 1, endRowIndex: 5000, startColumnIndex: 0, endColumnIndex: 7 },
        cell: { userEnteredFormat: { backgroundColor: white, textFormat: { bold: false, foregroundColor: black } } },
        fields: 'userEnteredFormat(backgroundColor,textFormat)' } },
      { repeatCell: { range: { sheetId: histId, startRowIndex: 0, endRowIndex: 5000, startColumnIndex: 0, endColumnIndex: 7 },
        cell: { userEnteredFormat: { borders: { top: solid(grey), bottom: solid(grey), left: solid(grey), right: solid(grey) } } },
        fields: 'userEnteredFormat.borders' } },
      { updateSheetProperties: { properties: { sheetId: histId, gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' } },
    ]}
  );

  S._invSheetId = invId;
  return spreadsheetId;
}
