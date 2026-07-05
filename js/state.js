/**
 * state.js — Shared application state and constants.
 * Imported by every other module that needs to read or write state.
 */

export const CLIENT_ID =
  '1003127305142-ucdql7nnag18sfkca159qi4v2nbaqiio.apps.googleusercontent.com';

export const S = {
  sheetUrl:       localStorage.getItem('sheetUrl')      || '',
  spreadsheetId:  localStorage.getItem('spreadsheetId') || '',
  accessToken:    null,
  tokenTimer:     null,
  offlineQueue:   JSON.parse(localStorage.getItem('offlineQueue') || '[]'),
  minQty:         JSON.parse(localStorage.getItem('minQty')       || '{}'),
  inventoryCache: [],
  currentTab:     'scan',
  _invSheetId:    null,   // cached after first applyRowFormatting call
};

export function saveQueue() {
  localStorage.setItem('offlineQueue', JSON.stringify(S.offlineQueue));
}
