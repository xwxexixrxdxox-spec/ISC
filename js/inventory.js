/**
 * inventory.js -- Inventory list view, min/max thresholds, quick-adjust
 * inline buttons, edit modal, item history, and shopping list.
 */

import { S, getThreshold }               from './state.js';
import { $, setStatus }                  from './utils.js';
import { sheetsRead, sheetsBatchUpdate } from './api.js';
import { ensureToken }                   from './auth.js';
import { writeToSheet }                  from './offline.js';

/* --- Inventory list view ------------------------------------------------- */

export async function loadInventoryView() {
  if (!S.spreadsheetId || !S.accessToken) return;
  const loading = $('inv-loading');
  const list    = $('inv-list');
  if (loading) loading.style.display = 'block';
  if (list)    list.innerHTML = '';
  try {
    await ensureToken();
    const data = await sheetsRead(S.spreadsheetId, 'Inventory!A:H');
    const allRows = (data.values || []).slice(1).filter(r => String(r[0]||'').trim());

    // Sync min/max thresholds from ALL sheet rows before trimming
    allRows.forEach(r => {
      const barcode  = String(r[0] || '').trim();
      if (!barcode) return;
      const sheetMin = parseInt(r[6]) || 0;
      const sheetMax = parseInt(r[7]) || 0;
      if (sheetMin > 0 || sheetMax > 0) S.minQty[barcode] = { min: sheetMin, max: sheetMax };
    });
    localStorage.setItem('minQty', JSON.stringify(S.minQty));

    // Sort by Last Updated (col F, index 5) descending -- most recent first.
    // Keep only the 10 most recently updated items in memory.
    // Full inventory remains in Google Sheets.
    allRows.sort((a, b) => {
      const ta = new Date(String(a[5]||0)).getTime() || 0;
      const tb = new Date(String(b[5]||0)).getTime() || 0;
      return tb - ta;
    });
    const CACHE_LIMIT = 10;
    S.inventoryCache = allRows.slice(0, CACHE_LIMIT);

    renderInventoryList(S.inventoryCache, $('inv-search')?.value.trim().toLowerCase() || '');
    updateLowStockBadge();

    // Show a note so users know this is a recent-items view
    const countEl = $('inv-count');
    if (countEl && allRows.length > CACHE_LIMIT) {
      countEl.textContent = 'Showing 10 most recently updated of ' + allRows.length + ' items -- full list in Google Sheets';
    }
  } catch (e) {
    if (e.message === 'TOKEN_EXPIRED') { await ensureToken(); loadInventoryView(); }
    else if (list) list.innerHTML = '<div class="inv-empty">Could not load: ' + e.message + '</div>';
  } finally {
    if (loading) loading.style.display = 'none';
  }
}

export function renderInventoryList(rows, filter) {
  const list = $('inv-list');
  if (!list) return;

  const filtered = filter
    ? rows.filter(r => (String(r[0]||'') + String(r[1]||'')).toLowerCase().includes(filter))
    : [...rows];

  if (!filtered.length) {
    list.innerHTML = '<div class="inv-empty">No items found</div>';
    if ($('inv-count')) $('inv-count').textContent = '0 items';
    return;
  }

  filtered.sort((a, b) => {
    const aqty = Number(a[2])||0, bqty = Number(b[2])||0;
    const at = getThreshold(String(a[0]||'')), bt = getThreshold(String(b[0]||''));
    const aLow = at.min > 0 && aqty <= at.min;
    const bLow = bt.min > 0 && bqty <= bt.min;
    if (aLow && !bLow) return -1;
    if (!aLow && bLow) return 1;
    return String(a[1]||a[0]).localeCompare(String(b[1]||b[0]));
  });

  list.innerHTML = filtered.map(r => buildRowHtml(r)).join('');
  if ($('inv-count')) $('inv-count').textContent = filtered.length + ' item' + (filtered.length !== 1 ? 's' : '');
}

function buildRowHtml(r) {
  const barcode = String(r[0] || '');
  const name    = String(r[1] || barcode || '\u2014');
  const qty     = Number(r[2]) || 0;
  const unit    = String(r[3] || '');
  const price   = r[4] ? '$' + parseFloat(r[4]).toFixed(2) : '';
  const t       = getThreshold(barcode);
  const isLow   = t.min > 0 && qty <= t.min;
  const isFull  = t.max > 0 && qty >= t.max;
  const reorder = (isLow && t.max > 0) ? (t.max - qty) : null;

  let badge = '';
  if (isLow)       badge = ' <span style="color:var(--red);font-size:0.72rem;">\u26a0 Reorder</span>';
  else if (isFull) badge = ' <span style="color:var(--accent);font-size:0.72rem;">\u2713 Full</span>';

  const threshInfo = [];
  if (t.min > 0) threshInfo.push('min ' + t.min);
  if (t.max > 0) threshInfo.push('max ' + t.max);
  if (reorder !== null && reorder > 0) threshInfo.push('order ' + reorder + ' to restock');
  const sub = barcode + (threshInfo.length ? ' \u00b7 ' + threshInfo.join(' / ') : '');

  // Safe versions for inline onclick -- strip/escape single quotes
  const sBar  = barcode.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
  const sName = name.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
  const sUnit = unit.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
  const sPric = String(r[4]||'').replace(/'/g,'');

  return '<div class="inv-item' + (isLow ? ' low-item' : '') + '" data-barcode="' + barcode + '" role="listitem">'
    + '<div class="inv-item-left" style="cursor:pointer;flex:1;" onclick="openMinQtyModal(\'' + sBar + '\',\'' + sName + '\',' + qty + ',' + t.min + ')" aria-label="Set stock alert">'
      + '<div class="inv-item-name">' + name + badge + '</div>'
      + '<div class="inv-item-bc">' + sub + (price ? ' \u00b7 ' + price : '') + '</div>'
    + '</div>'
    + '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">'
      + '<div class="inv-item-qty' + (isLow ? ' low' : '') + '">' + qty + ' <span class="inv-item-unit">' + unit + '</span></div>'
      + '<div class="inv-adj-wrap">'
        + '<button class="inv-adj-btn minus" onclick="quickAdjust(\'' + sBar + '\',-1,this)" aria-label="Remove one">\u2212</button>'
        + '<span class="inv-adj-saving" aria-live="polite"></span>'
        + '<button class="inv-adj-btn plus"  onclick="quickAdjust(\'' + sBar + '\',1,this)"  aria-label="Add one">+</button>'
        + '<button style="background:none;border:none;color:var(--muted);font-size:0.9rem;cursor:pointer;padding:2px;width:auto;margin:0;" onclick="openEditModal(\'' + sBar + '\',\'' + sName + '\',\'' + sUnit + '\',\'' + sPric + '\',' + qty + ')" aria-label="Edit item">\u270f\ufe0f</button>'
      + '</div>'
    + '</div>'
  + '</div>';
}

/* --- Low stock badge + Badging API -------------------------------------- */

export function updateLowStockBadge() {
  const count = S.inventoryCache.filter(r => {
    const t = getThreshold(String(r[0]||''));
    return t.min > 0 && (Number(r[2])||0) <= t.min;
  }).length;

  const badge = $('low-stock-badge');
  if (badge) { badge.textContent = count; badge.style.display = count > 0 ? 'inline-flex' : 'none'; }

  // App icon badge when installed as PWA
  if ('setAppBadge' in navigator) {
    if (count > 0) navigator.setAppBadge(count).catch(() => {});
    else           navigator.clearAppBadge().catch(() => {});
  }
}

/* --- Quick inline stock adjust ------------------------------------------- */

export async function quickAdjust(barcode, delta, btnEl) {
  if (!S.spreadsheetId) return;
  const row = S.inventoryCache.find(r => String(r[0]||'').trim() === barcode);
  if (!row) return;
  btnEl.disabled = true;
  const saving = btnEl.parentElement?.querySelector('.inv-adj-saving');
  if (saving) saving.textContent = '\u2026';
  try {
    await ensureToken();
    const payload = {
      spreadsheetId: S.spreadsheetId,
      barcode,
      description:   String(row[1]||''),
      qtyChange:     delta,
      unit:          String(row[3]||''),
      price:         String(row[4]||''),
      timestamp:     new Date().toLocaleString(),
    };
    const result = await writeToSheet(payload);
    if (!result.queued) {
      row[2] = result.newQty;
      renderInventoryList(S.inventoryCache, $('inv-search')?.value.trim().toLowerCase() || '');
      updateLowStockBadge();
      window.dispatchEvent(new CustomEvent('show-undo', { detail: { payload, newQty: result.newQty } }));
    }
  } catch (e) {
    if (saving) saving.textContent = 'err';
    console.error('[QuickAdjust]', e.message);
  } finally {
    btnEl.disabled = false;
    if (saving) saving.textContent = '';
  }
}

/* --- Edit item modal ----------------------------------------------------- */

export function openEditModal(barcode, name, unit, price, qty) {
  document.querySelector('.modal-backdrop')?.remove();
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.innerHTML =
    '<div class="modal-sheet">'
    + '<div class="modal-title">Edit Item</div>'
    + '<div class="modal-sub" style="font-family:monospace;font-size:0.75rem;">' + barcode + '</div>'
    + '<label for="edit-qty">Quantity</label>'
    + '<input id="edit-qty" type="number" min="0" value="' + (qty||0) + '" aria-label="Current quantity">'
    + '<label for="edit-desc">Description</label>'
    + '<input id="edit-desc" value="' + (name||'').replace(/"/g,'&quot;') + '" aria-label="Item description">'
    + '<label for="edit-unit">Unit</label>'
    + '<input id="edit-unit" value="' + (unit||'').replace(/"/g,'&quot;') + '" aria-label="Unit">'
    + '<label for="edit-price">Price</label>'
    + '<div style="position:relative;">'
      + '<span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--muted);">$</span>'
      + '<input id="edit-price" type="number" step="0.01" min="0" value="' + (price||'') + '" style="padding-left:24px;" aria-label="Price">'
    + '</div>'
    + '<div id="edit-status" role="status" aria-live="polite"></div>'
    + '<div class="row" style="margin-top:12px;">'
      + '<button class="btn-secondary btn-sm" onclick="this.closest(\'.modal-backdrop\').remove()">Cancel</button>'
      + '<button class="btn-primary btn-sm" id="edit-save-btn" onclick="saveEditedItem(\'' + barcode.replace(/'/g,"\\'") + '\')">Save</button>'
    + '</div>'
  + '</div>';
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
  $('edit-desc')?.focus();
}

export async function saveEditedItem(barcode) {
  const btn = $('edit-save-btn');
  if (btn) btn.disabled = true;
  setStatus('edit-status', 'Saving\u2026', 'info');
  const description = ($('edit-desc')?.value || '').trim();
  const unit        = ($('edit-unit')?.value || '').trim();
  const price       = ($('edit-price')?.value || '').trim();
  if (!description) { setStatus('edit-status', 'Description cannot be empty.', 'err'); if (btn) btn.disabled = false; return; }
  const qtyRaw = ($('edit-qty')?.value || '').trim();
  const newQty = qtyRaw !== '' ? parseInt(qtyRaw, 10) : null;
  try {
    await ensureToken();
    const data = await sheetsRead(S.spreadsheetId, 'Inventory!A:A');
    const rows = data.values || [];
    let rowIndex = -1;
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]||'').trim() === barcode) { rowIndex = i + 1; break; }
    }
    if (rowIndex === -1) { setStatus('edit-status', 'Item not found.', 'err'); if (btn) btn.disabled = false; return; }
    const updates = [
      { range: 'Inventory!B' + rowIndex, values: [[description]] },
      { range: 'Inventory!D' + rowIndex, values: [[unit]] },
    ];
    if (newQty !== null && !isNaN(newQty)) updates.push({ range: 'Inventory!C' + rowIndex, values: [[newQty]] });
    if (price !== '') updates.push({ range: 'Inventory!E' + rowIndex, values: [[parseFloat(price)]] });
    if (newQty !== null && !isNaN(newQty)) updates.push({ range: 'Inventory!F' + rowIndex, values: [[new Date().toLocaleString()]] });
    await sheetsBatchUpdate(S.spreadsheetId, updates);
    const cached = S.inventoryCache.find(r => String(r[0]||'').trim() === barcode);
    if (cached) {
      cached[1] = description;
      if (newQty !== null && !isNaN(newQty)) cached[2] = newQty;
      cached[3] = unit;
      if (price !== '') cached[4] = parseFloat(price);
    }
    document.querySelector('.modal-backdrop')?.remove();
    renderInventoryList(S.inventoryCache, $('inv-search')?.value.trim().toLowerCase() || '');
  } catch (e) {
    setStatus('edit-status', 'Save failed: ' + e.message, 'err');
    if (btn) btn.disabled = false;
  }
}

/* --- Min / Max threshold modal ------------------------------------------- */

export function openMinQtyModal(barcode, name, qty) {
  document.querySelector('.modal-backdrop')?.remove();
  const thresholds = S.minQty[barcode] || {};
  const curMin = typeof thresholds === 'object' ? (thresholds.min || 0) : (thresholds || 0);
  const curMax = typeof thresholds === 'object' ? (thresholds.max || 0) : 0;

  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.innerHTML =
    '<div class="modal-sheet">'
    + '<div class="modal-title">' + name + '</div>'
    + '<div class="modal-sub">Barcode: ' + barcode + ' \u00b7 Current stock: ' + qty + '</div>'
    + '<label for="minQtyInput">Reorder alert \u2014 alert when stock falls to or below:</label>'
    + '<input id="minQtyInput" type="number" min="0" value="' + curMin + '" placeholder="0 = no alert" aria-label="Minimum stock level">'
    + '<label for="maxQtyInput" style="margin-top:10px;">Maximum stock \u2014 order up to this level:</label>'
    + '<input id="maxQtyInput" type="number" min="0" value="' + curMax + '" placeholder="0 = no maximum" aria-label="Maximum stock level">'
    + '<div id="threshold-hint" style="font-size:0.72rem;color:var(--muted);margin-top:6px;line-height:1.5;" aria-live="polite"></div>'
    + '<div class="row" style="margin-top:12px;">'
      + '<button class="btn-secondary btn-sm" onclick="this.closest(\'.modal-backdrop\').remove()">Cancel</button>'
      + '<button class="btn-outline btn-sm" onclick="openItemHistory(\'' + barcode.replace(/'/g,"\\'") + '\',\'' + name.replace(/'/g,"\\'") + '\')">&#x1F4CB; History</button>'
      + '<button class="btn-green btn-sm" onclick="saveThreshold(\'' + barcode.replace(/'/g,"\\'") + '\',document.getElementById(\'minQtyInput\').value,document.getElementById(\'maxQtyInput\').value)">Save</button>'
    + '</div>'
  + '</div>';
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);

  const updateHint = () => {
    const min  = parseInt($('minQtyInput')?.value, 10) || 0;
    const max  = parseInt($('maxQtyInput')?.value, 10) || 0;
    const hint = $('threshold-hint');
    if (!hint) return;
    const parts = [];
    if (min > 0) parts.push('Alert fires when stock \u2264 ' + min);
    if (max > 0 && min > 0) parts.push('Reorder quantity: ' + (max - min) + ' units');
    else if (max > 0) parts.push('Max capacity: ' + max + ' units');
    hint.textContent = parts.join(' \u00b7 ');
  };
  $('minQtyInput')?.addEventListener('input', updateHint);
  $('maxQtyInput')?.addEventListener('input', updateHint);
  updateHint();
  $('minQtyInput')?.focus();
}

export function saveThreshold(barcode, minVal, maxVal) {
  const min = parseInt(minVal, 10) || 0;
  const max = parseInt(maxVal, 10) || 0;
  if (min > 0 || max > 0) S.minQty[barcode] = { min, max };
  else delete S.minQty[barcode];
  localStorage.setItem('minQty', JSON.stringify(S.minQty));
  document.querySelector('.modal-backdrop')?.remove();
  renderInventoryList(S.inventoryCache, $('inv-search')?.value.trim().toLowerCase() || '');
  updateLowStockBadge();
  writeThresholdToSheet(barcode, min, max).catch(e => console.warn('[Threshold]', e.message));
}

async function writeThresholdToSheet(barcode, min, max) {
  if (!S.spreadsheetId) return;
  await ensureToken();
  const data = await sheetsRead(S.spreadsheetId, 'Inventory!A:A');
  const rows = data.values || [];
  let rowIndex = -1;
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]||'').trim() === barcode) { rowIndex = i + 1; break; }
  }
  if (rowIndex === -1) return;
  await sheetsBatchUpdate(S.spreadsheetId, [
    { range: 'Inventory!G' + rowIndex, values: [[min > 0 ? min : '']] },
    { range: 'Inventory!H' + rowIndex, values: [[max > 0 ? max : '']] },
  ]);
}

export const saveMinQty = (b, v) => saveThreshold(b, v, 0);

/* --- Shopping list (Reorder tab) ----------------------------------------- */

export function renderShoppingList() {
  const container = $('shopping-list');
  const empty     = $('list-empty');
  if (!container) return;

  const lowItems = S.inventoryCache.filter(r => {
    const t = getThreshold(String(r[0]||''));
    return t.min > 0 && (Number(r[2])||0) <= t.min;
  }).sort((a, b) => {
    const at = getThreshold(String(a[0]||'')), bt = getThreshold(String(b[0]||''));
    const aRatio = at.min > 0 ? (Number(a[2])||0) / at.min : 1;
    const bRatio = bt.min > 0 ? (Number(b[2])||0) / bt.min : 1;
    return aRatio - bRatio;
  });

  if (empty) empty.style.display = lowItems.length ? 'none' : 'block';
  if (!lowItems.length) { container.innerHTML = ''; return; }

  container.innerHTML = lowItems.map(r => {
    const barcode = String(r[0]||'');
    const name    = String(r[1]||barcode||'\u2014');
    const qty     = Number(r[2])||0;
    const unit    = String(r[3]||'');
    const t       = getThreshold(barcode);
    const reorder = t.max > 0 ? (t.max - qty) : (t.min * 2 - qty);
    const pct     = t.min > 0 ? Math.round((qty / t.min) * 100) : 0;
    return '<div class="shop-item" role="listitem">'
      + '<div>'
        + '<div class="shop-item-name">' + name + '</div>'
        + '<div class="shop-item-bc">' + barcode + ' \u00b7 have ' + qty + (unit ? ' ' + unit : '') + ' \u00b7 min ' + t.min + '</div>'
      + '</div>'
      + '<div class="shop-item-right">'
        + '<div class="shop-order-qty">' + (reorder > 0 ? reorder : t.min) + '</div>'
        + '<div class="shop-order-lbl">' + (unit||'units') + ' to order</div>'
        + '<div style="font-size:0.65rem;color:var(--muted);">' + pct + '% of min</div>'
      + '</div>'
    + '</div>';
  }).join('');
}

/* --- Item history (last 10 transactions) --------------------------------- */

export async function openItemHistory(barcode, name) {
  document.querySelector('.modal-backdrop')?.remove();
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.innerHTML =
    '<div class="modal-sheet">'
    + '<div class="modal-title">History: ' + name + '</div>'
    + '<div class="modal-sub" style="font-family:monospace;font-size:0.72rem;">' + barcode + '</div>'
    + '<div id="hist-loading" style="text-align:center;color:var(--muted);padding:20px;font-size:0.85rem;">Loading\u2026</div>'
    + '<div id="hist-list"></div>'
    + '<button class="btn-secondary btn-sm" style="margin-top:12px;" onclick="this.closest(\'.modal-backdrop\').remove()">Close</button>'
  + '</div>';
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);

  try {
    await ensureToken();
    const data    = await sheetsRead(S.spreadsheetId, 'History!A:G');
    const rows    = (data.values || []).slice(1);
    const entries = rows.filter(r => String(r[1]||'').trim() === barcode).reverse().slice(0, 10);
    const loading = $('hist-loading');
    const list    = $('hist-list');
    if (loading) loading.style.display = 'none';
    if (!entries.length) {
      if (list) list.innerHTML = '<div style="text-align:center;color:var(--muted);padding:16px;font-size:0.85rem;">No history found for this item.</div>';
      return;
    }
    if (list) list.innerHTML = entries.map(r => {
      const change = String(r[3]||'0');
      const isPos  = !change.startsWith('-');
      return '<div class="hist-row">'
        + '<div>'
          + '<span class="hist-change ' + (isPos ? 'positive' : 'negative') + '">' + (isPos ? '+' : '') + change + '</span>'
          + '<span style="color:var(--muted);font-size:0.78rem;margin-left:6px;">\u2192 ' + String(r[4]||'\u2014') + ' in stock</span>'
        + '</div>'
        + '<div class="hist-ts">' + String(r[0]||'\u2014') + '</div>'
      + '</div>';
    }).join('');
  } catch (e) {
    const loading = $('hist-loading');
    if (loading) loading.textContent = 'Could not load history: ' + e.message;
  }
}

/* --- Wire search, refresh, and init ------------------------------------- */

export function initInventory() {
  $('inv-search')?.addEventListener('input', function () {
    renderInventoryList(S.inventoryCache, this.value.trim().toLowerCase());
  });
  $('inv-refresh')?.addEventListener('click', () => {
    S.inventoryCache = [];
    loadInventoryView();
  });
}