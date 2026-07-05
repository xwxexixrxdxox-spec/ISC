# 📦 Inventory Scanner

A mobile-first Progressive Web App for real-time inventory control. Scan barcodes with your phone camera, look up product info and live vendor prices automatically, track stock that syncs to your Google Sheet — with a full audit log, offline support, low-stock alerts, min/max reorder thresholds, item history, and a reorder shopping list.

[![Live App](https://img.shields.io/badge/Live%20App-GitHub%20Pages-22c55e?style=flat-square)](https://xwxexixrxdxox-spec.github.io/ISC/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](./LICENSE)
[![PWA Ready](https://img.shields.io/badge/PWA-Ready-7c3aed?style=flat-square)](https://pwabuilder.com)
[![JS Check](https://github.com/xwxexixrxdxox-spec/ISC/actions/workflows/lint.yml/badge.svg)](https://github.com/xwxexixrxdxox-spec/ISC/actions/workflows/lint.yml)

---

## Features

| Feature | Details |
|---|---|
| 📷 Barcode scanning | BarcodeDetector API — no hardware needed. 3-read confirmation rejects false positives. 5-frame miss tolerance for hand movement. |
| 🏷 Product lookup | Open Food Facts — description, unit, and estimated price auto-filled from barcode |
| 💰 Live vendor prices | UPCitemdb → Open Food Facts Prices → Google Shopping fallback. Sorted cheapest first. Cached per session. |
| 📊 Google Sheets sync | Direct Sheets API v4 writes — no middleman, no CORS issues |
| ⚡ Auto setup | Signs in with Google, creates Inventory + History sheet with full formatting automatically |
| 🤝 Join shared sheet | Enter a spreadsheet URL or ID to connect to a teammate's existing sheet |
| 🔁 Smart reconnect | Re-authentication always reconnects to your existing sheet — never creates a duplicate |
| 📡 Offline queue | Scans queue locally when offline and auto-sync on reconnect |
| ↩ Undo | 30-second countdown toast after every stock change. Tapping reverses the write. |
| ➕ Quick adjust | Inline − / + buttons on every inventory row. Adjust by 1 without scanning. |
| ✏️ Edit items | Edit description, unit, and price directly from the app |
| 📋 Reorder tab | Third tab showing only low-stock items sorted by urgency, with order quantities and a Share button |
| 📖 Item history | Last 10 stock changes for any item, pulled from the History sheet |
| ⚠️ Low stock alerts | Set minimum per item — low items badge in tab bar and sort to top |
| 📦 Min / Max thresholds | Set reorder minimum and stock maximum. App calculates order-up-to quantity. Stored in sheet columns G/H, syncs across all devices. |
| 🔔 App icon badge | PWA icon shows low-stock count badge when installed to home screen |
| 🔄 Token refresh | OAuth tokens silently refreshed at 50 minutes — sessions never expire mid-scan |
| 📱 PWA installable | Add to home screen on Android or iOS. Package for Play Store / Microsoft Store via PWABuilder. |
| 🌗 Light / dark mode | Respects device system theme automatically |
| ♿ Accessible | ARIA labels, roles, and live regions throughout |
| 🔒 Private | No backend, no accounts, no analytics. All data stays in your Google Drive. |

---

## Setup (~10 minutes, one time)

### 1. Google Cloud Project

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → **New Project**
2. **APIs & Services → Library** → enable **Google Sheets API** and **Google Drive API**
3. **OAuth consent screen** → External → fill in app name and your email → Save
   - Under **Test users** → **+ Add Users** → add your Gmail address
4. **Credentials → Create Credentials → OAuth Client ID**
   - Type: **Web application**
   - Authorized JavaScript origins: `https://xwxexixrxdxox-spec.github.io`
   - Click **Create** → copy the **Client ID**

> The consent screen stays in Testing mode (100-user limit) until you submit for Google verification. For personal or small-team use, Testing mode is fine indefinitely as long as users are added as test users.

### 2. Open the App

1. Go to [https://xwxexixrxdxox-spec.github.io/ISC/](https://xwxexixrxdxox-spec.github.io/ISC/)
2. Tap **Sign in with Google** (button is disabled briefly while Google's library loads)
3. Sign in with the account you added as a test user
4. The app creates your sheet and lands on the scanner

---

## Daily Use

### Scanning
Tap **📷 Scan Barcode**, hold the barcode steady — progress shows 33% → 66% → 100%. Description, unit, and price auto-fill. Vendor prices load below the price field sorted cheapest first. Adjust quantity and tap **+ Add Stock** or **− Remove**. An undo toast appears for 30 seconds after every change.

### Inventory tab
Browse all items, search by name or barcode, and use the inline − / + buttons to adjust without scanning. Tap an item name to set min/max thresholds. Tap ✏️ to edit description, unit, or price. Low-stock items sort to the top.

### Reorder tab
Shows only items below their minimum threshold sorted by urgency. Each row shows exactly how many units to order. Tap **📤 Share** to send the list as a text message, email, or copy to clipboard.

### Item history
In the threshold modal (tap any item name), tap **📋 History** to see the last 10 stock changes with timestamps.

### Joining a team sheet
On the welcome screen, paste a Google Sheets URL or spreadsheet ID into the "Joining a team?" field and tap **Connect to this Sheet**. You'll be asked to sign in and the app connects to the shared sheet instead of creating your own.

### Viewing the sheet
Tap **📊 View Sheet** to open the Google Sheet in a new browser tab. On Android, Chrome shows an "Open in app" banner — tap it to jump to the native Google Sheets app.

### Re-authenticating
**Settings → 🔄 Re-authenticate Google** refreshes your sign-in while keeping your sheet connected.

### Starting fresh
**Settings → ⚠️ Start Fresh** disconnects and creates a new sheet on next sign-in. Your old sheet stays in Google Drive.

---

## Google Sheet Structure

### Inventory tab

| Col | Contents |
|---|---|
| A | Barcode (TEXT format — leading zeros preserved) |
| B | Description |
| C | Quantity |
| D | Unit |
| E | Price (currency format) |
| F | Last Updated |
| G | Min Qty (reorder threshold) |
| H | Max Qty (stock maximum) |

### History tab

Timestamp · Barcode · Description · Change · New Qty · Unit · Price

Every stock change is recorded here. Used by the in-app Item History feature.

---

## Repo Structure

```
/
├── index.html               Main markup and screen definitions
├── css/
│   └── styles.css           All styles, light/dark mode, components
├── js/
│   ├── app.js               Entry point — routing, submit, boot, error boundary
│   ├── state.js             Shared S object, CLIENT_ID, getThreshold
│   ├── utils.js             $(), setStatus(), withRetry()
│   ├── api.js               Google Sheets API — read, append, batchUpdate, formatting
│   ├── auth.js              OAuth, token refresh, ensureToken
│   ├── setup.js             Sheet creation, Drive search, setup wizard
│   ├── offline.js           Offline queue, writeToSheet, audit log
│   ├── scanner.js           Camera, barcode detection, product + vendor lookup
│   ├── inventory.js         List view, quick-adjust, edit modal, thresholds, history, shopping list
│   ├── undo.js              30-second undo with countdown toast
│   └── pwa.js               Install prompt, service worker registration
├── .github/
│   └── workflows/
│       └── lint.yml         Auto syntax-check on every push
├── manifest.json            PWA manifest (shortcuts, icons, display modes)
├── service-worker.js        Offline caching — network-first for HTML/JS/CSS
├── privacy-policy.html      Required for store submissions
├── icons/
│   ├── icon-192.png
│   └── icon-512.png
├── Inventory_Template.csv   Reference column structure
├── CHANGELOG.md
├── LICENSE                  MIT
└── README.md
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| App | Vanilla JS ES modules — no framework, no build step |
| Barcode scanning | BarcodeDetector API (Chrome on Android) |
| Product lookup | Open Food Facts API |
| Vendor prices | UPCitemdb free tier → Open Food Facts Prices API |
| Data storage | Google Sheets API v4 (direct browser writes via OAuth token) |
| Auth | Google Identity Services (OAuth 2.0) |
| Hosting | GitHub Pages |
| CI | GitHub Actions (`node --check` on every push) |
| Store packaging | [PWABuilder](https://pwabuilder.com) |

---

## Store Publishing

Before submitting to stores, ensure:
- [ ] OAuth consent screen submitted for Google verification (lifts 100-user limit)
- [ ] Real app icon replacing placeholder (192×192 and 512×512 PNG)
- [ ] Store screenshots taken (at least 2)
- [ ] `privacy-policy.html` URL confirmed live

Then:
1. Go to [pwabuilder.com](https://pwabuilder.com) → paste `https://xwxexixrxdxox-spec.github.io/ISC/`
2. Download Android (`.aab`) or Windows (`.msix`) package
3. Submit via [Google Play Console](https://play.google.com/console) ($25 one-time) or [Microsoft Partner Center](https://partner.microsoft.com/dashboard) (free)

---

## Known Limitations

- **Vendor prices** — UPCitemdb free tier: 100 lookups/day per IP, US retail coverage. Open Food Facts Prices: crowdsourced, variable coverage. Results cached per session so repeated scans don't burn the daily limit.
- **Google Sheets app on Android** — Chrome intercepts `docs.google.com` URLs before they reach Android's intent system, so the native Sheets app cannot be opened programmatically. Tap **View Sheet** to open in Chrome, then use Chrome's built-in "Open in app" banner to jump to the Sheets app.
- **OAuth test users** — the consent screen is in Testing mode. Users must be manually added in the Google Cloud Console until the app is verified by Google.
- **BarcodeDetector API** — only available in Chrome on Android. Other browsers show a manual entry fallback.

---

## License

MIT — see [LICENSE](./LICENSE)
