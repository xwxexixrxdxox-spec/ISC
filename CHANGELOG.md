# Changelog

All notable changes to Inventory Scanner are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [1.1.0] — 2026-07-02

### Added
- **In-app inventory list view** — browse all stock levels, search by name or barcode, sort with low-stock items at top
- **Low stock alerts** — tap any item in the inventory list to set a minimum quantity threshold; items at or below it are flagged with a red badge and ⚠ indicator
- **Offline queue** — scans made without an internet connection are queued in local storage and automatically synced the moment connectivity returns; amber bar shows queue status
- **Audit log (History tab)** — every stock change is recorded to a second "History" sheet tab with timestamp, barcode, description, quantity change, and new total
- **Background token refresh** — OAuth tokens are silently refreshed 10 minutes before expiry (at 50-min mark) so sessions never expire mid-scan
- **Bottom navigation** — tab bar switches between Scan and Inventory views
- **Frozen header rows** — both Inventory and History sheets have their header row frozen via the API
- **Privacy Policy page** — required for Google Play and Microsoft Store submissions
- **MIT License**
- **CSS and JS split into separate files** — `css/styles.css` and `js/app.js` for maintainability

### Fixed
- **Sheet formatting bug** — rows below the header no longer inherit the navy/white style. Root cause was `INSERT_ROWS` append mode copying formatting from the row above; fixed by switching to `OVERWRITE` mode which writes to pre-formatted empty cells
- **Leading zeros on barcodes** — Barcode column pre-formatted as TEXT type in the Sheets API during sheet creation
- **Stale service worker** — self-healing snippet now targets `isc-v5`; service worker uses network-first for HTML/JS/CSS so updates deploy immediately

### Removed
- Dead code: `createScriptProject`, `uploadScriptCode`, `createVersion`, `deployScript` — never called since architecture shifted to direct Sheets API writes
- `google_apps_script.gs` — no longer part of the architecture; direct Sheets API is used instead

### Changed
- Setup flow simplified — only creates the Google Sheet (no Apps Script project), making setup ~2x faster
- Scanner miss tolerance raised to 5 frames — reduces resets from slight hand movement
- Scan confirmation shows percentage progress: "Hold steady… 33% → 66% → 100%"

---

## [1.0.0] — 2026-06-30

### Added
- Initial working release
- Camera barcode scanning via BarcodeDetector API (Chrome on Android)
- Barcode confirmation: requires 3 consecutive identical reads to reject false positives from nearby printed numbers
- Product lookup from Open Food Facts public API (name, unit, estimated price)
- OAuth 2.0 sign-in via Google Identity Services
- Auto-creation of Google Sheet on first setup — no manual URL copying
- Direct Google Sheets API writes (replaced earlier Apps Script approach which had CORS issues)
- Unit of measurement dropdown with common options + custom entry
- Price field with crowdsourced average from Open Food Facts Prices API
- Service worker for offline loading of app shell
- PWA manifest for installability and store packaging
- GitHub Pages hosting
