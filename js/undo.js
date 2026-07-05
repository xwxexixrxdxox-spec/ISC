/**
 * undo.js -- 30-second undo window for the last stock change.
 * Shows a countdown toast; tapping Undo reverses the write.
 */

import { $, setStatus }  from './utils.js';
import { ensureToken }   from './auth.js';
import { writeToSheet }  from './offline.js';
import { S }             from './state.js';

const UNDO_MS = 30000;
let undoTimer = null;
let undoState = null;

export function showUndoToast(payload, newQty) {
  undoState = { ...payload, newQty };
  clearUndo();

  const toast    = $('undo-toast');
  const msg      = $('undo-msg');
  const progress = $('undo-progress');
  if (!toast) return;

  const sign = payload.qtyChange > 0 ? '+' : '';
  if (msg)  msg.textContent = sign + payload.qtyChange + ' -- tap to undo';
  toast.classList.remove('hidden');

  // Reset and animate the progress bar
  if (progress) {
    progress.style.transition = 'none';
    progress.style.width = '100%';
    requestAnimationFrame(() => requestAnimationFrame(() => {
      progress.style.transition = `width ${UNDO_MS}ms linear`;
      progress.style.width = '0%';
    }));
  }

  undoTimer = setTimeout(clearUndo, UNDO_MS);
}

export function clearUndo() {
  undoState = null;
  if (undoTimer) { clearTimeout(undoTimer); undoTimer = null; }
  $('undo-toast')?.classList.add('hidden');
}

export async function performUndo() {
  if (!undoState) return;
  const { spreadsheetId, barcode, description, qtyChange, unit, price, newQty } = undoState;
  clearUndo();
  setStatus('result', 'Undoing...', 'info');
  try {
    await ensureToken();
    const result = await writeToSheet({
      spreadsheetId, barcode, description,
      qtyChange: -qtyChange,
      unit, price,
      timestamp: new Date().toLocaleString(),
    }, false);
    setStatus('result', '<- Undone -- stock restored to ' + result.newQty, 'ok');
    S.inventoryCache = [];
    window.dispatchEvent(new CustomEvent('update-badge'));
  } catch (e) {
    setStatus('result', 'Undo failed: ' + e.message, 'err');
  }
}

export function initUndo() {
  $('undo-btn')?.addEventListener('click', performUndo);
}
