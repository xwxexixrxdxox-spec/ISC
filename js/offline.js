/**
 * offline.js -- Offline queue and the core writeToSheet function.
 * All stock changes flow through writeToSheet regardless of online status.
 */

import { S, saveQueue, getThreshold } from './state.js';
import { sheetsRead, sheetsAppend, sheetsBatchUpdate } from './api.js';
import { ensureToken }               from './auth.js';

export function isOnline() { return navigator.onLine; }

/** Add a write payload to the offline queue */
export function queueWrite(payload) {
  S.offlineQueue.push({ ...payload, queuedAt: new Date().toISOString() });
  saveQueue();
  updateOfflineBar();
}

/** Replay all queued writes when connectivity returns */
export async function flushOfflineQueue() {
  if (!isOnline() || !S.offlineQueue.length || !S.accessToken) return;
  const queue = [...S.offlineQueue];
  S.offlineQueue = [];
  saveQueue();
  const failed = [];
  for (const item of queue) {
    try { await writeToSheet(item, false); }
    catch (e) { console.warn('[Queue] Flush failed:', e.message); failed.push(item); }
  }
  if (failed.length) { S.offlineQueue = [...failed, ...S.offlineQueue]; saveQueue(); }
  updateOfflineBar();
}

/** Show/hide the amber offline indicator bar */
export function updateOfflineBar() {
  const bar = document.getElementById('offline-bar');
  if (!bar) return;
  if (!isOnline()) {
    bar.textContent = '[offline] You are offline -- changes will sync when connection returns';
    bar.style.display = 'block';
  } else if (S.offlineQueue.length) {
    bar.textContent = `[loading] Syncing ${S.offlineQueue.length} queued item(s)...`;
    bar.style.display = 'block';
  } else {
    bar.style.display = 'none';
  }
}

window.addEventListener('online',  () => { updateOfflineBar(); flushOfflineQueue(); });
window.addEventListener('offline', () => updateOfflineBar());

/**
 * Core write function. Reads current sheet state, updates quantity, writes
 * audit log row, and returns the new quantity.
 * If offline (and allowQueue is true), enqueues and returns { queued: true }.
 */
export async function writeToSheet(payload, allowQueue = true) {
  const { spreadsheetId, barcode, description, qtyChange, unit, price, timestamp } = payload;

  if (!isOnline()) {
    if (allowQueue) queueWrite(payload);
    return { queued: true };
  }

  await ensureToken();

  const sheetData = await sheetsRead(spreadsheetId, 'Inventory!A:H');
  const rows = sheetData.values || [[]];
  let rowIndex = -1;
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0] || '').trim() === barcode) { rowIndex = i; break; }
  }

  // getThreshold imported from state.js -- no circular dep
  const t = getThreshold(barcode);

  let newQty;
  if (rowIndex === -1) {
    newQty = Math.max(qtyChange, 0);
    await sheetsAppend(spreadsheetId, 'Inventory', [
      barcode, description, newQty, unit,
      price !== '' ? parseFloat(price) : '',
      timestamp, t.min || '', t.max || '',
    ]);
  } else {
    const currentQty = Number(rows[rowIndex][2]) || 0;
    newQty = Math.max(currentQty + qtyChange, 0);
    const r = rowIndex + 1;
    const updates = [
      { range: `Inventory!C${r}`, values: [[newQty]] },
      { range: `Inventory!F${r}`, values: [[timestamp]] },
      { range: `Inventory!G${r}`, values: [[t.min || '']] },
      { range: `Inventory!H${r}`, values: [[t.max || '']] },
    ];
    if (description && !rows[rowIndex][1]) updates.push({ range: `Inventory!B${r}`, values: [[description]] });
    if (unit       && !rows[rowIndex][3]) updates.push({ range: `Inventory!D${r}`, values: [[unit]] });
    if (price !== '' && !rows[rowIndex][4]) updates.push({ range: `Inventory!E${r}`, values: [[parseFloat(price)]] });
    await sheetsBatchUpdate(spreadsheetId, updates);
  }

  // Audit log -- non-blocking, failure does not break the write
  try {
    const changeLabel = (qtyChange > 0 ? '+' : '') + qtyChange;
    await sheetsAppend(spreadsheetId, 'History', [
      timestamp, barcode, description, changeLabel, newQty, unit,
      price !== '' ? parseFloat(price) : '',
    ]);
  } catch (e) {
    console.warn('[Audit] History write skipped:', e.message);
  }

  return { newQty };
}
