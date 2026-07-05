# Changelog

All notable changes to Inventory Scanner are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [1.5.0] -- 2026-07-05

### Added
- **Quantity field in edit modal** -- the pencil icon on every inventory row now
  exposes four editable fields: Quantity, Description, Unit, and Price. Changing
  quantity writes directly to column C and updates the Last Updated timestamp in
  column F so the audit trail stays accurate.
- **Silent re-authentication** -- on every app load, if the user has previously
  authorized the app, a silent background token request is made with no UI shown.
  Returning users go straight to the scanner without tapping anything. The
  welcome screen only appears when authorization genuinely needs to be re-granted.
- **Sign Out button** -- Settings now has a dedicated Sign Out action that revokes
  the OAuth token with Google (full permission clear), clears the access token
  from memory, and returns to the welcome screen. The sheet connection is kept so
  signing back in reconnects automatically.
- **Shared sheet access hint** -- when a user connects via "Join a shared sheet",
  a blue card appears showing their own Google account email and exact instructions
  for asking the sheet owner to grant Editor access. Auto-dismisses after 20
  seconds. Prevents the silent failure where a user can view but not update stock.
- **User email stored** -- after OAuth, the signed-in email is fetched from the
  Google userinfo endpoint and stored so the shared sheet hint can display it.

### Fixed
- **OAuth permissions dialog shown every sign-in** -- changed `prompt: 'consent'`
  to `prompt: 'select_account'` in requestToken. Google now only asks for
  permissions on the very first authorization. Subsequent sign-ins show only the
  account picker.
- **Undo button non-functional** -- removed the broken reverse-write undo system
  entirely. The undo toast and countdown timer are gone. Quantity is now directly
  editable in the edit modal, which is a simpler and more reliable correction path.
- **Service worker serving stale cached files** -- rewrote service-worker.js with
  a network-only + no-cache strategy for all JS/CSS/HTML files. The `cache: 'no-cache'`
  fetch option bypasses both the service worker cache and the browser HTTP cache,
  guaranteeing fresh files on every load. Only falls back to cache when genuinely
  offline. Static assets (icons, manifest) remain cache-first. Version bumping
  is no longer needed to force cache invalidation.
- **Syntax error: smart quote in app.js** -- `doesn't` contained a right single
  quotation mark (U+2019) that was converted to a regular apostrophe during ASCII
  sanitization, breaking the enclosing single-quoted string. Changed to "does not"
  to avoid the issue entirely.
- **Syntax error: nested quotes in shared sheet hint dismiss button** -- inline
  `getElementById('shared-sheet-hint')` inside a single-quoted string caused a
  parse error. Extracted to a named `dismissSharedHint()` function exposed on
  `window`.
- **GitHub Actions Node.js deprecation warning** -- updated `lint.yml` from
  `node-version: '20'` to `node-version: '24'` to match the current runner
  environment.
- **Non-ASCII characters causing syntax errors** -- all 11 JS module files
  sanitized to pure 7-bit ASCII. Unicode characters introduced during development
  (em dashes, ellipsis, smart quotes, emoji, arrows) were being silently corrupted
  by WinRAR and similar tools that misidentify UTF-8 encoding. All replaced with
  ASCII equivalents or removed.

### Changed
- **Undo system replaced** -- `undo.js` is now a stub of empty no-op exports.
  The module is kept so existing imports do not break but performs no action.
- **Settings panel order** -- Sign Out appears first, Re-authenticate second,
  Start Fresh (destructive, red) third.

---

## [1.4.0] -- 2026-07-04

### Added
- **Join shared sheet** -- second option on the welcome screen. Paste any Google
  Sheets URL or spreadsheet ID to connect to an existing shared sheet instead of
  creating a new one. Intended for teams sharing one inventory across multiple devices.
- **Reorder tab** -- third tab in the bottom navigation. Shows only items below
  their minimum threshold, sorted by urgency (most depleted as a percentage of
  minimum first). Each row shows item name, current quantity, minimum, and exactly
  how many units to order. Share button sends the list via Web Share API or copies
  to clipboard.
- **Scanner FAB on inventory tab** -- floating camera button on the inventory tab.
  Tapping switches to the scan tab and opens the camera automatically.
- **Item history in-app** -- "History" button in the threshold modal. Shows the
  last 10 stock changes for that item pulled from the History sheet tab with
  timestamp, change amount, and new total.
- **App icon badge (Badging API)** -- when installed as a PWA, the home screen
  icon shows a badge count equal to the number of items below their minimum
  threshold. Clears when stock is restocked.
- **GitHub Actions lint workflow** -- `.github/workflows/lint.yml` runs
  `node --check` on all JS modules automatically on every push to the js/ folder.

### Fixed
- **inventory.js corruption** -- previous surgical Python insertions stacked
  duplicate History buttons and broken escape sequences inside template literals.
  Rewrote inventory.js completely using string concatenation instead of template
  literals for dynamic HTML.
- **ES module circular dependencies** -- three circular import chains resolved:
  setup.js <-> app.js (replaced with custom DOM events), offline.js <->
  inventory.js (getThreshold moved to state.js), undo.js <-> inventory.js
  (replaced with show-undo event).
- **Inline SW killer** -- added a plain script block before the module entry point
  to unregister stale service workers even when app.js fails to load.
- **onerror attribute quoting** -- backslash-escaped quotes inside HTML attributes
  caused SyntaxError. Replaced with a separately defined onModuleError() function.
- **Start Fresh reconnecting to old sheet** -- force-new-sheet sessionStorage flag
  now correctly bypasses Drive search and always creates a new sheet.

### Changed
- **All modal HTML construction** switched from template literals to string
  concatenation to make escaping errors visible to syntax checkers.

---

## [1.3.0] -- 2026-07-03

### Added
- **ES module split** -- monolithic 1555-line app.js split into 11 focused files:
  state.js, utils.js, api.js, auth.js, setup.js, offline.js, scanner.js,
  inventory.js, undo.js, pwa.js, app.js.
- **Undo last stock change** -- 30-second countdown toast with reverse-write.
  (Replaced in v1.5.0 with quantity editing.)
- **Quick inline stock adjust** -- inline minus/plus buttons on every inventory row.
- **Edit item modal** -- description, unit, and price editable from app.
  (Quantity added in v1.5.0.)
- **PWA install banner** -- captures beforeinstallprompt, shows once, remembered.
- **Light/dark mode** -- respects device system theme automatically.
- **ARIA accessibility** -- aria-label, role, aria-live, aria-selected throughout.
- **Retry/exponential backoff** -- withRetry() on all Google API calls.
- **Global error boundary** -- window.onerror and unhandledrejection handlers.
- **Per-row sheet formatting** -- applyRowFormatting() after every sheetsAppend.
- **Live vendor price lookup** -- UPCitemdb then Open Food Facts Prices fallback.
- **Min/Max reorder thresholds** -- stored in sheet columns G and H, syncs across
  devices.

### Fixed
- **White data rows** -- sheetsAppend uses OVERWRITE mode (not INSERT_ROWS).
- **sheetId hardcoded as 0** -- read from API response.
- **Dead code removed** -- createScriptProject, uploadScriptCode, deployScript,
  applySheetFormatting, google_apps_script.gs all removed.
- **Stale service worker** -- self-healing IIFE targets isc-v5.

---

## [1.2.0] -- 2026-07-02

### Added
- **Smart reconnect** -- runFullSetup searches Drive before creating a sheet.
- **Hardcoded Client ID** -- users see only a Sign in with Google button.
- **Welcome screen** -- replaces the two-step Client ID + Connect wizard.
- **GIS readiness guard** -- button disabled until GIS library loads.
- **Background token refresh** -- silent refresh at 50 minutes.
- **Offline queue** -- scans queue locally and auto-sync on reconnect.
- **Inventory list** -- search, sort, low-stock alerts, badge count.
- **Audit log** -- History sheet tab records every stock change.
- **Frozen header rows** -- both sheet tabs frozen via API.
- **Bottom navigation** -- tab bar for Scan and Inventory.
- **Privacy Policy** -- privacy-policy.html at live URL.
- **MIT License**
- **PWA icons** -- barcode-themed dark-navy icons at 192x192 and 512x512.

### Fixed
- **White data rows (root cause)** -- OVERWRITE mode in sheetsAppend.
- **sheetId: 0 error** -- read from res.sheets[0].properties.sheetId.
- **Orphan closing bracket syntax error** -- found via node --check.

---

## [1.1.0] -- 2026-07-01

### Added
- **Direct Sheets API writes** -- replaced Apps Script backend.
- **Auto-creation of Google Sheet** -- Inventory + History tabs with formatting.
- **Barcode confirmation reads** -- 3 consecutive reads, 5-frame miss tolerance.
- **Open Food Facts lookup** -- name, unit, price estimate.
- **Service worker** -- offline app shell caching.
- **PWA manifest** -- installable with shortcuts.

---

## [1.0.0] -- 2026-06-30

### Added
- Initial working release.
- Camera barcode scanning via BarcodeDetector API.
- OAuth 2.0 via Google Identity Services.
- Two-step setup wizard (Client ID entry + Connect).
- GitHub Pages hosting.
