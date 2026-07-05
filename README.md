# Inventory Scanner

A mobile-first Progressive Web App for real-time inventory control. Scan
barcodes with your phone camera, look up product info and live vendor prices,
track stock that syncs to your Google Sheet -- with a full audit log, offline
support, low-stock alerts, reorder thresholds, item history, and a reorder
shopping list.

[![Live App](https://img.shields.io/badge/Live%20App-GitHub%20Pages-22c55e?style=flat-square)](https://xwxexixrxdxox-spec.github.io/ISC/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](./LICENSE)
[![PWA Ready](https://img.shields.io/badge/PWA-Ready-7c3aed?style=flat-square)](https://pwabuilder.com)
[![JS Check](https://github.com/xwxexixrxdxox-spec/ISC/actions/workflows/lint.yml/badge.svg)](https://github.com/xwxexixrxdxox-spec/ISC/actions/workflows/lint.yml)

---

## Features

| Feature | Details |
|---|---|
| Barcode scanning | BarcodeDetector API. 3-read confirmation rejects false positives. 5-frame miss tolerance for hand movement. |
| Product lookup | Open Food Facts -- description, unit, and price auto-filled. |
| Live vendor prices | UPCitemdb free tier then Open Food Facts Prices fallback. Sorted cheapest first. Cached per session. |
| Google Sheets sync | Direct Sheets API v4 writes via OAuth token. No middleman. |
| Auto setup | Signs in with Google once, creates your Inventory and History sheet automatically. |
| Silent re-auth | Returning users go straight to the scanner. No button taps, no permissions prompt after first use. |
| Join shared sheet | Paste a Google Sheets URL to connect to a teammate's existing sheet instead of creating your own. |
| Offline queue | Scans queue locally when offline and auto-sync on reconnect. |
| Inventory list | Browse all stock levels, search, sort, inline plus/minus adjust by 1. |
| Edit items | Quantity, description, unit, and price all editable from the app without touching the sheet. |
| Reorder tab | Shows only low-stock items sorted by urgency with exact order quantities. One-tap share. |
| Item history | Last 10 stock changes for any item pulled from the History sheet tab. |
| Low stock alerts | Minimum per item -- low items badge in the tab bar and sort to top. |
| Min/Max thresholds | Set reorder minimum and stock maximum. Calculates order quantity. Stored in sheet columns G/H. Syncs across devices. |
| App icon badge | Home screen icon shows low-stock count when installed as a PWA. |
| Token refresh | OAuth tokens silently refreshed at 50 minutes. Sessions never expire mid-scan. |
| Sign out | Revokes OAuth token with Google, clears credentials, keeps sheet connected for easy reconnect. |
| Installable PWA | Add to home screen on Android or iOS. Package for Play Store via PWABuilder. |
| Light/dark mode | Respects device system theme. |
| Accessible | ARIA labels, roles, and live regions throughout. |
| No stale cache | Service worker uses network-only + no-cache for all JS/CSS/HTML. No version bumping needed. |
| Private | No backend server, no accounts, no analytics. All data goes to your own Google Drive. |

---

## Setup (10 minutes, one time only)

### 1. Google Cloud Project

1. Go to console.cloud.google.com and create a new project.
2. APIs & Services > Library -- enable Google Sheets API and Google Drive API.
3. OAuth consent screen > External > fill in app name and email > Save.
   Under Test users, add your Gmail address.
4. Credentials > Create Credentials > OAuth Client ID.
   Type: Web application.
   Authorized JavaScript origins: https://xwxexixrxdxox-spec.github.io
   Click Create and copy the Client ID.

The consent screen stays in Testing mode (100-user limit) until submitted
for Google verification. For personal or small-team use, Testing mode is
fine indefinitely as long as users are added as test users.

### 2. Open the App

1. Go to https://xwxexixrxdxox-spec.github.io/ISC/
2. Tap Sign in with Google (button is briefly disabled while Google's
   library loads -- this is normal).
3. Sign in with the account you added as a test user.
4. The app creates your sheet and lands on the scanner.

From this point on, opening the app signs you in silently -- no button tap
needed.

---

## Daily Use

### Scanning
Tap Scan Barcode, hold the barcode steady -- progress fills 33% > 66% > 100%.
Description, unit, and price auto-fill from Open Food Facts. Vendor prices load
sorted cheapest first. Adjust quantity and tap Add Stock or Remove.

### Adjusting without scanning
Use the inline minus/plus buttons on any inventory row to change by 1
immediately, or tap the pencil icon to open the edit modal and set an exact
quantity, description, unit, or price.

### Inventory tab
Browse all items, search by name or barcode. Low-stock items sort to the top
with a reorder badge. Tap an item name to set min/max thresholds. Tap the clock
icon to see its last 10 changes.

### Reorder tab
Shows only items below their minimum threshold, sorted by most urgently depleted
first. Tap Share to send the list as a message, email, or clipboard copy.

### Joining a team sheet
On the welcome screen, paste a Google Sheets URL or spreadsheet ID in the
"Joining a team?" field and tap Connect. You will be prompted to sign in and
the app connects to the shared sheet. The sheet owner must share the sheet
with your Google account as an Editor -- the app shows a hint with your email
address and exact steps after connecting.

### Viewing the sheet
Tap View Sheet to open in a new browser tab. On Android, Chrome shows an
"Open in app" banner -- tap it to jump to the native Google Sheets app.

### Signing out
Settings > Sign Out. Revokes Google permissions and returns to the welcome
screen. Your sheet stays remembered so signing back in reconnects automatically.

---

## Google Sheet Structure

### Inventory tab

| Column | Contents |
|---|---|
| A | Barcode (TEXT format -- leading zeros preserved) |
| B | Description |
| C | Quantity |
| D | Unit |
| E | Price (currency format) |
| F | Last Updated |
| G | Min Qty (reorder threshold) |
| H | Max Qty (stock maximum) |

### History tab

Timestamp, Barcode, Description, Change, New Qty, Unit, Price.
Every stock change is recorded here. Used by the in-app item history feature.

---

## Repo Structure

```
/
+-- index.html                 Main markup and screen definitions
+-- css/
|   +-- styles.css             All styles, light/dark mode, components
+-- js/
|   +-- app.js                 Entry point -- routing, submit, boot, error boundary
|   +-- state.js               Shared S object, CLIENT_ID, getThreshold
|   +-- utils.js               $(), setStatus(), withRetry()
|   +-- api.js                 Google Sheets API -- read, append, batchUpdate
|   +-- auth.js                OAuth, silent re-auth, token refresh
|   +-- setup.js               Sheet creation, Drive search, setup wizard
|   +-- offline.js             Offline queue, writeToSheet, audit log
|   +-- scanner.js             Camera, barcode detection, product and vendor lookup
|   +-- inventory.js           List view, edit modal, thresholds, history, shopping list
|   +-- undo.js                Stub (undo removed in v1.5.0)
|   +-- pwa.js                 Install prompt, service worker registration
+-- .github/
|   +-- workflows/
|       +-- lint.yml           Auto syntax-check on every push (Node.js 24)
+-- manifest.json              PWA manifest
+-- service-worker.js          Network-only for app files, cache-first for icons
+-- privacy-policy.html        Required for store submissions
+-- icons/
|   +-- icon-192.png
|   +-- icon-512.png
+-- Inventory_Template.csv     Reference column structure
+-- CHANGELOG.md
+-- LICENSE                    MIT
+-- README.md
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| App | Vanilla JS ES modules -- no framework, no build step |
| Barcode scanning | BarcodeDetector API (Chrome on Android) |
| Product lookup | Open Food Facts API |
| Vendor prices | UPCitemdb free tier then Open Food Facts Prices API |
| Data storage | Google Sheets API v4 (direct browser writes) |
| Auth | Google Identity Services (OAuth 2.0, silent re-auth) |
| Hosting | GitHub Pages |
| CI | GitHub Actions (node --check on every push, Node.js 24) |
| Store packaging | PWABuilder |

---

## Known Limitations

- **Vendor prices** -- UPCitemdb free tier: 100 lookups/day per IP, strongest
  on US retail. Open Food Facts Prices: crowdsourced, variable coverage.
  Results cached per session.
- **Google Sheets app on Android** -- Chrome intercepts docs.google.com URLs
  before they reach Android's intent system. Tap View Sheet to open in Chrome,
  then use Chrome's built-in Open in app banner to jump to the Sheets app.
- **OAuth test users** -- 100-user limit until Google verifies the consent screen.
- **BarcodeDetector API** -- Chrome on Android only. Other browsers fall back to
  manual barcode entry.

---

## License

MIT -- see LICENSE
