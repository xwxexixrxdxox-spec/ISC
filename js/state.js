/**
 * state.js -- Shared application state and constants.
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

/** Read min/max thresholds for a barcode. Handles legacy number format. */
export function getThreshold(barcode) {
  const S_obj = S; // reference the module-level S
  const t = S_obj.minQty[barcode];
  if (!t)                    return { min: 0, max: 0 };
  if (typeof t === 'object') return { min: t.min || 0, max: t.max || 0 };
  return { min: t, max: 0 };
}

export function saveQueue() {
  localStorage.setItem('offlineQueue', JSON.stringify(S.offlineQueue));
}
