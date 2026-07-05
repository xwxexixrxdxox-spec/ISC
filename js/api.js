/**
 * api.js — All Google Sheets API calls.
 * Handles auth headers, retry, and per-row formatting.
 */

import { S } from './state.js';
import { withRetry } from './utils.js';

/** Authenticated JSON request to any Google API */
export async function gapi(url, method, body) {
  const res = await fetch(url, {
    method,
    headers: {
      'Authorization': 'Bearer ' + S.accessToken,
      'Content-Type':  'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) {
    const msg = (data.error && data.error.message) || JSON.stringify(data);
    throw new Error(msg);
  }
  return data;
}

/** Read a range from the Inventory sheet */
export async function sheetsRead(spreadsheetId, range) {
  return withRetry(async () => {
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`
      + `/values/${encodeURIComponent(range)}`,
      { headers: { 'Authorization': 'Bearer ' + S.accessToken } }
    );
    if (res.status === 401) throw new Error('TOKEN_EXPIRED');
    if (res.status === 429) throw new Error('429 Rate limited by Google — retrying');
    if (!res.ok) throw new Error('Read failed ' + res.status);
    return res.json();
  });
}

/**
 * Append a row to a named sheet.
 * Uses OVERWRITE mode so rows land on pre-formatted cells (not INSERT_ROWS,
 * which copies the header's navy style onto every new row).
 * After appending, applies explicit white/black formatting to the new row.
 */
export async function sheetsAppend(spreadsheetId, sheetName, row) {
  return withRetry(async () => {
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`
      + `/values/${encodeURIComponent(sheetName + '!A:Z')}`
      + ':append?valueInputOption=USER_ENTERED&insertDataOption=OVERWRITE',
      {
        method:  'POST',
        headers: { 'Authorization': 'Bearer ' + S.accessToken, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ majorDimension: 'ROWS', values: [row] }),
      }
    );
    if (res.status === 401) throw new Error('TOKEN_EXPIRED');
    if (res.status === 429) throw new Error('429 Rate limited — retrying');
    if (!res.ok) throw new Error('Append failed ' + res.status);
    const data = await res.json();

    // Belt-and-suspenders: explicitly format the new row white/black so it
    // can never inherit the header's navy style, regardless of OVERWRITE behaviour.
    if (sheetName === 'Inventory' && data.updates?.updatedRange) {
      const match = data.updates.updatedRange.match(/(\d+)(?::\w+\d+)?$/);
      if (match) {
        applyRowFormatting(spreadsheetId, parseInt(match[1]))
          .catch(e => console.warn('[Format] Row formatting skipped:', e.message));
      }
    }
    return data;
  });
}

/** Update multiple named ranges in one request */
export async function sheetsBatchUpdate(spreadsheetId, data) {
  return withRetry(async () => {
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
      {
        method:  'POST',
        headers: { 'Authorization': 'Bearer ' + S.accessToken, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ valueInputOption: 'USER_ENTERED', data }),
      }
    );
    if (res.status === 401) throw new Error('TOKEN_EXPIRED');
    if (res.status === 429) throw new Error('429 Rate limited — retrying');
    if (!res.ok) throw new Error('Update failed ' + res.status);
    return res.json();
  });
}

/**
 * Apply white background + black text to one specific Inventory row.
 * Called after every sheetsAppend to guarantee no style bleed from the header.
 * Caches the sheetId in S._invSheetId after the first call.
 */
export async function applyRowFormatting(spreadsheetId, rowNum) {
  if (!S._invSheetId && S._invSheetId !== 0) {
    const meta = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`,
      { headers: { 'Authorization': 'Bearer ' + S.accessToken } }
    ).then(r => r.json());
    S._invSheetId = (meta.sheets || [])
      .find(s => s.properties.title === 'Inventory')
      ?.properties.sheetId ?? 0;
  }
  const white = { red: 1, green: 1, blue: 1 };
  const black = { red: 0, green: 0, blue: 0 };
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method:  'POST',
      headers: { 'Authorization': 'Bearer ' + S.accessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests: [{
        repeatCell: {
          range: { sheetId: S._invSheetId, startRowIndex: rowNum - 1, endRowIndex: rowNum, startColumnIndex: 0, endColumnIndex: 8 },
          cell:  { userEnteredFormat: { backgroundColor: white, textFormat: { bold: false, foregroundColor: black } } },
          fields: 'userEnteredFormat(backgroundColor,textFormat)',
        },
      }]}),
    }
  );
}
