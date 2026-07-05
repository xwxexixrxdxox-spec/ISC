/**
 * undo.js -- Post-save toast with a direct link to Google Sheets undo.
 * Replaces the complex reverse-write approach with a simple "open Sheets,
 * hit Ctrl+Z" flow that uses Google's own unlimited undo history.
 */

import { S }           from './state.js';
import { $ }           from './utils.js';

export function showUndoToast(payload, newQty) {
  const toast = $('undo-toast');
  const msg   = $('undo-msg');
  if (!toast) return;

  const sign = payload.qtyChange > 0 ? '+' : '';
  if (msg) msg.textContent = sign + payload.qtyChange + ' saved -- tap to undo in Sheets';
  toast.classList.remove('hidden');

  // Hide the countdown progress bar -- no timer needed
  const bar = $('undo-progress');
  if (bar) bar.parentElement.style.display = 'none';
}

export function clearUndo() {
  $('undo-toast')?.classList.add('hidden');
}

export function initUndo() {
  // Undo button opens the Google Sheet so the user can hit Ctrl+Z / Cmd+Z
  $('undo-btn')?.addEventListener('click', () => {
    if (S.sheetUrl) window.open(S.sheetUrl, '_blank', 'noopener');
    clearUndo();
  });

  // Dismiss button (the X that closes the toast without opening Sheets)
  $('undo-dismiss')?.addEventListener('click', clearUndo);
}
