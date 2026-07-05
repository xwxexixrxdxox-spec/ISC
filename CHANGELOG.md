# Changelog

All notable changes to Inventory Scanner are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [1.2.0] — 2026-07-04

### Added
- **Live vendor price lookup** — UPCitemdb free API fetches real vendor listings after every scan, sorted cheapest first with a trophy on the best deal. Tapping any row fills the price field. Results cached in sessionStorage per barcode so repeated scans do not consume the 100/day free limit.
- **Google Shopping fallback** — if UPCitemdb returns no results, a search link opens Google Shopping for the product name or barcode.
- **Min / Max reorder thresholds** — upgraded from min-only to full min/max. Minimum triggers a reorder alert. Maximum sets target stock level; both together calculate "order N to restock" automatically. Full badge shown when stock hits maximum.
- **Thresholds in Google Sheet** — columns G (Min Qty) and H (Max Qty) added. Setting a threshold in the app writes it to the sheet immediately. Loading the Inventory view syncs thresholds from the sheet so all devices sharing the sheet see the same alert levels. Values can also be typed directly into G/H in Google Sheets.
- **Vendor price panel UI** — styled list below the price field showing merchant name, condition, price, and shipping. Appears after barcode lookup, cleared when a new scan begins.

### Fixed
- **Start Fresh now always creates a new sheet** — previously Start Fresh cleared localStorage but runFullSetup immediately searched Drive and reconnected to the old sheet. Fixed by writing a force-new-sheet flag to sessionStorage before reload; runFullSetup reads and clears the flag on startup, skipping the Drive search when set.
- **Opening Google Sheets app on Android** — intent:// URL via window.location.href, intent:// as direct anchor href, and Web Share API all attempted. All three fail to reliably open the native Sheets app from an external Chrome-hosted page for docs.google.com URLs because Chrome intercepts those URLs before they reach Android's intent system. Reverted to opening a new Chrome tab; a one-time hint explains Chrome's built-in "Open in app" banner which is the reliable path to the native app.

### Changed
- **Sheet column count 6 to 8** — Inventory sheet gains Min Qty and Max Qty columns. Existing sheets need a Start Fresh to get the new structure.
- **Min/max modal** — redesigned with two inputs and a live hint showing calculated reorder quantity as you type.
- **Threshold storage format** — upgraded from a plain number to an object with min and max keys. Backward compatible with legacy number entries.

---

## [1.1.0] — 2026-07-02

### Added
- **In-app inventory list view** — Inventory tab with search, sort, and real-time stock levels loaded from the sheet.
- **Low stock alerts** — minimum quantity per item; items at or below threshold sort to top with a badge count in the tab bar.
- **Offline queue** — scans queued in localStorage when offline; amber bar shows pending count; auto-synced on reconnect.
- **Audit log (History tab)** — second sheet tab records every stock change with timestamp, barcode, description, change amount, and new total.
- **Background token refresh** — OAuth tokens silently refreshed at 50 minutes so sessions never expire mid-scan.
- **Smart reconnect on re-auth** — runFullSetup now searches Drive for an existing sheet before creating one. Re-authentication reconnects to the same sheet instead of creating a duplicate.
- **Re-authenticate and Start Fresh buttons** — separated into two distinct actions: Re-authenticate keeps the sheet connection; Start Fresh (red, destructive) creates a new sheet.
- **Hardcoded Client ID** — OAuth Client ID moved from a user-entered field into the app. Users see only a Sign in with Google button.
- **Welcome screen** — clean single-screen onboarding replacing the two-step setup wizard.
- **GIS readiness guard** — button disabled with Loading text until Google Identity Services initialises. Specific error messages for popup_closed_by_user, access_denied, and general failures.
- **Frozen header rows** — both sheet tabs have row 1 frozen via the API.
- **Bottom navigation** — tab bar for Scan and Inventory views.
- **Privacy Policy page** — required for Google Play and Microsoft Store submissions.
- **MIT License**
- **CSS and JS extracted** to separate files for maintainability.
- **PWA icons** — barcode-themed icons (dark navy, white barcode graphic, green scan line).
- **Diagnostic panel** — visible on welcome screen showing JS load status, GIS status, origin, and Client ID prefix.

### Fixed
- **White data rows** — root cause: sheetsAppend with INSERT_ROWS copies formatting from the row above (navy header). Fixed by switching to OVERWRITE mode which writes to pre-formatted empty rows.
- **Orphan closing bracket syntax error** — stale bracket from a refactor caused a silent JS syntax error preventing the entire script from running. Found via node --check.
- **Stale service worker** — cache name bumped to isc-v5; self-healing IIFE unregisters old workers on first session load.
- **Leading zeros on barcodes** — Barcode column pre-formatted as TEXT during sheet creation.
- **Scanner miss tolerance** — up to 5 consecutive missed frames tolerated before the read streak resets. Reduces false resets from slight hand movement.
- **sheetId hardcoded as 0** — caused "No grid with id: 0" errors. Now read from the API response.
- **Dead code removed** — createScriptProject, uploadScriptCode, createVersion, deployScript, applySheetFormatting, and google_apps_script.gs all removed.

### Changed
- **Setup simplified** — creates only the Google Sheet (no Apps Script). Setup is roughly twice as fast.
- **OAuth scopes reduced** — Apps Script scopes removed since direct Sheets API is used.
- **Sheet formatting moved into createSheet** — applied in a single batchUpdate at creation time.

---

## [1.0.0] — 2026-06-30

### Added
- Initial working release
- Camera barcode scanning via BarcodeDetector API (Chrome on Android)
- 3-read confirmation before accepting a barcode
- Product lookup from Open Food Facts (name, unit, estimated price)
- OAuth 2.0 sign-in via Google Identity Services
- Two-step setup wizard: Client ID entry then Google sign-in
- Auto-creation of Google Sheet on first setup
- Direct Google Sheets API v4 writes from the browser
- Unit dropdown with common options and custom entry
- Price field with Open Food Facts Prices API average
- Service worker for offline app shell loading
- PWA manifest for installability
- GitHub Pages hosting

### Architecture note
Initial approach used Google Apps Script as a backend deployed via API. Abandoned due to CORS errors with POST requests, OAuth invalid_client errors from account switching, Apps Script requiring manual authorization before anonymous calls worked, and silent failures in no-cors mode. Final architecture: browser writes directly to Google Sheets API v4 using GIS OAuth token.
