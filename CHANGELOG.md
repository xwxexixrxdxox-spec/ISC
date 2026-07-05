# Changelog

All notable changes to Inventory Scanner are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [1.4.0] — 2026-07-05

### Added
- **Join shared sheet** — second option on the welcome screen. Paste any Google Sheets URL or spreadsheet ID to connect to an existing sheet instead of creating a new one. Designed for teams sharing one inventory sheet across multiple phones.
- **Reorder tab (📋)** — third tab in the bottom navigation showing only items below their minimum threshold, sorted by most depleted first. Each row shows the item name, current quantity, minimum, and exactly how many units to order. Share button sends the list via Web Share API (message, email, clipboard).
- **Scanner FAB on inventory tab** — floating camera button on the inventory tab. Tapping it switches to the scan tab and opens the camera, so you can scan without manually switching tabs.
- **Item history in-app** — "📋 History" button in the threshold modal for each item. Shows the last 10 stock changes pulled from the History sheet, with timestamp, change amount, and new total. No extra API call needed — reads the History tab that is already being written on every change.
- **App icon badge (Badging API)** — when the app is installed to the home screen as a PWA, the icon displays a number badge equal to the low-stock item count. Clears automatically when stock is restocked above minimum.
- **GitHub Actions lint workflow** — `.github/workflows/lint.yml` runs `node --check` on all JS modules automatically on every push. Catches syntax errors before they reach production.

### Fixed
- **inventory.js corruption** — previous surgical Python insertions (cat >> and line-based inserts) stacked duplicate History buttons and broken escape sequences inside template literals. `node --check` could not detect these because they were valid JS strings at the syntax level. Rewrote inventory.js completely using string concatenation instead of template literals for dynamic HTML, making all escaping visible and checkable.
- **ES module circular dependencies** — three circular import chains resolved:
  - `setup.js` ↔ `app.js` — replaced with custom DOM events (`setup-show-screen`, `setup-complete`, `setup-go-welcome`)
  - `offline.js` ↔ `inventory.js` — `getThreshold` moved to `state.js` where both can import it
  - `undo.js` ↔ `inventory.js` — replaced with custom DOM event (`show-undo`)
- **Inline SW killer** — added a plain (non-module) `<script>` block before the module entry point that unregisters stale service workers. Previously the self-healing code was inside `app.js` — if module loading failed, the healer never ran and old cached files could persist indefinitely.
- **onerror attribute quoting** — `\\'` inside an HTML attribute is not a valid escape sequence and caused "Uncaught SyntaxError: Invalid or unexpected token". Replaced with a separately defined `onModuleError()` function in its own `<script>` block; the attribute is now simply `onerror="onModuleError()"`.

### Changed
- **All modal HTML construction** switched from template literals to string concatenation. Template literals hide escaping errors from syntax checkers; string concatenation exposes them immediately.

---

## [1.3.0] — 2026-07-04

### Added
- **Codebase split into ES modules** — monolithic 1,555-line `app.js` split into 11 focused files:
  - `state.js` — shared `S` object, `CLIENT_ID`, `getThreshold`, `saveQueue`
  - `utils.js` — `$()`, `setStatus()`, `withRetry()`
  - `api.js` — all Google Sheets API calls, per-row formatting
  - `auth.js` — OAuth, token refresh, `ensureToken`
  - `setup.js` — sheet creation, Drive search, setup wizard UI
  - `offline.js` — offline queue, `writeToSheet`, audit log
  - `scanner.js` — camera, barcode detection, product and vendor lookup
  - `inventory.js` — list view, quick-adjust, edit modal, thresholds
  - `undo.js` — 30-second undo with countdown toast
  - `pwa.js` — install prompt, service worker registration
  - `app.js` — routing, submit, boot, error boundary only
- **Undo last stock change** — every successful write shows a 30-second countdown toast with ↩ Undo button. Tapping it reverses the change through the same write pipeline, including offline queue and audit log.
- **Quick inline stock adjust** — each inventory list row has − and + buttons. Tapping adjusts stock by 1 immediately without scanning. Updates the sheet and the cached list in place.
- **Edit item modal** — ✏️ icon on every inventory row opens a modal to fix description, unit, and price without touching the Google Sheet.
- **PWA install banner** — captures `beforeinstallprompt` and shows a non-intrusive install nudge. Dismissal is remembered. Accepting triggers the native install flow.
- **Light / dark mode** — full `@media (prefers-color-scheme: light)` support. App respects the device system setting automatically.
- **ARIA accessibility** — `aria-label`, `role`, `aria-live`, `aria-selected`, and `aria-controls` attributes added throughout. Screen readers can navigate all interactive elements.
- **Diagnostic auto-hide** — diagnostic panel visible on the welcome screen hides after successful sign-in.
- **Retry / exponential backoff** — `withRetry()` wrapper on all Google API calls. 429 (rate limit) and 503 (service unavailable) errors retry automatically at 1s → 2s → 4s. All other errors throw immediately.
- **Global error boundary** — `window.addEventListener('error')` and `window.addEventListener('unhandledrejection')` catch unhandled failures and show a dismissible recovery banner instead of a silent white screen.
- **Per-row sheet formatting** — after every `sheetsAppend`, reads the new row number from the API response and explicitly applies white/black formatting to that exact row. Belt-and-suspenders alongside the OVERWRITE mode fix.
- **Live vendor price lookup** — UPCitemdb free API (100 lookups/day) fetches real vendor offers after every scan, sorted cheapest first. Fallback to Open Food Facts Prices API for items not in UPCitemdb. Google Shopping link always shown. Results cached in sessionStorage per barcode.
- **Min / Max reorder thresholds** — upgraded from min-only to full min/max. Minimum triggers ⚠ Reorder alert. Maximum sets target stock level. Together they calculate "order N to restock" automatically. Values stored in sheet columns G and H; sync across all devices sharing the sheet.
- **Thresholds in Google Sheet** — columns G (Min Qty) and H (Max Qty) added to the Inventory sheet. Setting a threshold in the app writes it to the sheet immediately via `writeThresholdToSheet()`.

### Fixed
- **Stale service worker** — self-healing IIFE in `app.js` targets `isc-v5` and unregisters any SW whose script URL does not contain that string.
- **Start Fresh correctly creates new sheet** — `sessionStorage.setItem('force-new-sheet','1')` set before reload; `runFullSetup` reads and clears the flag, skipping the Drive search when set.
- **Inventory rows always white** — `sheetsAppend` uses `OVERWRITE` mode (not `INSERT_ROWS`). New `applyRowFormatting()` explicitly formats the appended row after every write.

---

## [1.2.0] — 2026-07-03

### Added
- **Smart reconnect on re-authentication** — `runFullSetup` calls `findExistingSheet()` before creating a new sheet. Re-authentication after token expiry reconnects to the existing sheet instead of creating a duplicate.
- **Re-authenticate and Start Fresh buttons** — separated into two distinct actions with clear intent.
- **Hardcoded Client ID** — OAuth Client ID moved from a user-entered field into the app. Users see only a "Sign in with Google" button.
- **Welcome screen** — clean single-screen onboarding replacing the two-step Client ID + Connect wizard.
- **GIS readiness guard** — Sign in button disabled with "Loading…" until Google Identity Services initialises. Specific error messages for `popup_closed_by_user`, `access_denied`, and general failures.
- **Background token refresh** — OAuth tokens silently refreshed at 50 minutes via `scheduleTokenRefresh()`.
- **Offline queue** — scans queue in localStorage when offline; auto-synced on reconnect via `flushOfflineQueue()`.
- **In-app inventory list** — 📦 Inventory tab with search, sort, and real-time stock levels.
- **Low stock alerts** — minimum quantity per item; items at or below threshold sort to top with red ⚠ badge.
- **Audit log (History tab)** — second sheet tab records every stock change.
- **Frozen header rows** — both sheet tabs have row 1 frozen via the Sheets API.
- **Bottom navigation** — tab bar for Scan and Inventory views.
- **Privacy Policy page** — `privacy-policy.html` meets store submission requirements.
- **MIT License**
- **CSS and JS extracted** to separate files.
- **PWA icons** — barcode-themed dark-navy icons at 192×192 and 512×512.
- **Diagnostic panel** — shows JS load status, GIS status, origin, and Client ID on the welcome screen.

### Fixed
- **White data rows (root cause)** — `sheetsAppend` with `INSERT_ROWS` copies formatting from the header row. Switched to `OVERWRITE` mode.
- **`sheetId` hardcoded as 0** — caused "No grid with id: 0". Now read from `res.sheets[0].properties.sheetId`.
- **Orphan closing bracket** — stale `});` caused a JS syntax error that silently prevented the entire script from running. Found via `node --check`.
- **Dead code removed** — `createScriptProject`, `uploadScriptCode`, `createVersion`, `deployScript`, `applySheetFormatting`, and `google_apps_script.gs` all removed.

---

## [1.1.0] — 2026-07-01

### Added
- **Direct Sheets API writes** — replaced Apps Script backend. Browser writes directly to Google Sheets API v4 using GIS OAuth token. Eliminates CORS issues.
- **Auto-creation of Google Sheet** — creates Inventory + History tabs with formatting on first sign-in.
- **Drive API search before creating** — avoids duplicate sheets on re-authentication.
- **Barcode confirmation reads** — requires 3 consecutive identical reads; 5-frame miss tolerance for hand movement.
- **Open Food Facts lookup** — name, unit, estimated price from Prices API.
- **Service worker** — caches app shell for offline loading.
- **PWA manifest** — installable, with shortcuts for Scan and Inventory.

### Fixed
- **Apps Script CORS** — POST requests to Apps Script web apps were blocked by CORS. Switched to direct Sheets API with GET-based write approach, then migrated to OAuth token writes.
- **OAuth `invalid_client`** — caused by account switching during setup. Fixed by hardcoding Client ID.

---

## [1.0.0] — 2026-06-30

### Added
- Initial working release
- Camera barcode scanning via BarcodeDetector API
- OAuth 2.0 sign-in via Google Identity Services
- Two-step setup wizard
- GitHub Pages hosting
