# 📦 Inventory Scanner 

A mobile-first Progressive Web App for real-time inventory control. Scan barcodes with your phone camera, look up product info and live vendor prices automatically, track stock that syncs instantly to a Google Sheet — with a full audit log, offline support, low stock alerts, and min/max reorder thresholds.

[![Live App](https://img.shields.io/badge/Live%20App-GitHub%20Pages-22c55e?style=flat-square)](https://xwxexixrxdxox-spec.github.io/ISC/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](./LICENSE)
[![PWA Ready](https://img.shields.io/badge/PWA-Ready-7c3aed?style=flat-square)](https://pwabuilder.com)

---

## Features

| Feature | Details |
|---|---|
| 📷 Barcode scanning | BarcodeDetector API — no extra hardware. Requires 3 consecutive reads to reject false positives. 5-frame miss tolerance so slight hand movement does not reset progress. |
| 🏷 Auto product lookup | Open Food Facts — name, unit, and estimated price auto-filled from barcode |
| 💰 Live vendor prices | UPCitemdb free API — real vendor listings sorted cheapest first. Tap any row to use that price. Google Shopping fallback link for anything not found. |
| 📊 Live Google Sheets sync | Direct Sheets API writes — no Apps Script middleman, no CORS issues |
| ⚡ Auto setup | Signs in with Google once, creates your sheet automatically — no Client IDs or URLs to copy |
| 🔁 Smart reconnect | Re-authentication always reconnects to your existing sheet. Start Fresh creates a new one only when explicitly requested. |
| 📡 Offline queue | Scans made without internet are queued in localStorage and auto-synced on reconnect |
| 📋 Audit log | Every stock change recorded to a History tab: timestamp, barcode, description, quantity change, new total |
| ⚠️ Low stock alerts | Set minimum quantity per item — items at or below threshold bubble to top with a ⚠ Reorder badge |
| 📦 Min / Max thresholds | Set both a reorder minimum and a stock maximum. App calculates "order N to restock" automatically. Thresholds stored in Google Sheet columns G/H and sync across devices. |
| 🔄 Token refresh | OAuth tokens silently refreshed at 50 minutes — sessions never expire mid-scan |
| 📱 Installable PWA | Add to home screen on Android or iOS, or package for Google Play / Microsoft Store via PWABuilder |
| 🔒 Privacy first | No backend server, no accounts, no analytics. All data goes to your own Google Drive. |

---

## Initial Setup (~10 minutes, one time only)

### 1. Google Cloud Project

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → **New Project** (name it anything)
2. **APIs & Services → Library** → enable:
   - **Google Sheets API**
   - **Google Drive API**
3. **APIs & Services → OAuth consent screen**
   - Choose **External** → fill in app name and your email → Save and Continue through all steps
   - On the **Test users** screen → **+ Add Users** → add your Gmail address → Save
4. **Credentials → Create Credentials → OAuth Client ID**
   - Application type: **Web application**
   - Authorized JavaScript origins: `https://xwxexixrxdxox-spec.github.io`
   - Click **Create** — copy the **Client ID**

> **Note:** The OAuth consent screen stays in Testing mode (100 user limit) until you submit for Google verification. For personal or small team use, Testing mode is fine indefinitely as long as all users are added as test users.

---

### 2. Connect the App

1. Open the app at [https://xwxexixrxdxox-spec.github.io/ISC/](https://xwxexixrxdxox-spec.github.io/ISC/)
2. Tap **Sign in with Google** — the button is disabled until Google's library has fully loaded (shows "Loading…" briefly)
3. Sign in with the Google account you added as a test user
4. The app automatically:
   - Searches your Drive for an existing inventory sheet
   - Creates one if none is found — named **"Inventory Scanner — My Stock"**
   - Applies formatting: navy header row, white data rows, grey borders, currency and text column formats
   - Adds both an **Inventory** tab and a **History** (audit log) tab
5. You land on the scanner screen with a **📊 View Sheet** button in the top corner

---

## Daily Use

### Scanning an item
1. Tap **📷 Scan Barcode** — button shows "Loading…" until the camera is ready
2. Point at any barcode and hold steady — a progress bar fills from 33% → 66% → 100%
3. The app requires 3 consecutive identical reads before accepting (rejects nearby printed numbers). Slight movement is tolerated up to 5 missed frames before the streak resets.
4. Description, unit, and price auto-fill from Open Food Facts where available
5. Vendor prices load below the price field — sorted cheapest first with a 🏆 on the best deal. Tap any row to use that price.
6. Adjust quantity, tap **+ Add Stock** or **− Remove**
7. The Google Sheet updates in real time. The History tab gets a new row for every change.

### Offline scanning
If you lose internet mid-session, changes are queued locally. An amber bar appears at the top showing how many are pending. They sync automatically when connectivity returns.

### Inventory list
Tap the **📦 Inventory** tab to see all items with current stock levels. Use the search bar to filter by name or barcode. Items below their minimum threshold sort to the top with a ⚠ badge. Tap any item to set or edit its min/max thresholds.

### Min / Max thresholds
Tapping an item in the inventory list opens a modal with two fields:
- **Reorder alert** — alert fires when stock falls to or below this number
- **Maximum stock** — your target stock level when restocking

The modal shows a live hint as you type: `min 5 / max 50 / order 35 to restock`. Thresholds are written to columns G and H of your Google Sheet so they sync across all devices using the same sheet.

### Viewing your sheet
Tap **📊 View Sheet** to open your Google Sheet in a new browser tab. On Android, Chrome shows an "Open in app" banner at the top of the page — tap that to open in the native Google Sheets app.

### Re-authenticating
If your session expires, the next scan triggers a silent token refresh. If a manual re-auth is needed, go to **Settings → 🔄 Re-authenticate Google**. This keeps your existing sheet — it just refreshes the login.

### Starting fresh with a new sheet
**Settings → ⚠️ Start Fresh (new sheet)** disconnects from your current sheet and creates a new one on next sign-in. Your old sheet stays safely in Google Drive and can be reconnected by signing in again — the app searches Drive for it by name on every sign-in.

---

## Google Sheet Structure

| Column | Contents |
|---|---|
| A | Barcode (formatted as plain text — leading zeros preserved) |
| B | Description |
| C | Quantity |
| D | Unit |
| E | Price (currency formatted) |
| F | Last Updated |
| G | Min Qty (reorder threshold) |
| H | Max Qty (stock maximum) |

The **History** tab records every transaction:
Timestamp · Barcode · Description · Change · New Qty · Unit · Price

---

## Repo Structure

```
/
├── index.html              Main markup (screens, navigation, scanner UI)
├── css/
│   └── styles.css          All styles (design tokens, components, animations)
├── js/
│   └── app.js              All application logic (~1,100 lines, sectioned)
├── manifest.json           PWA manifest (shortcuts, icons, display modes)
├── service-worker.js       Offline caching — network-first for HTML/JS/CSS
├── privacy-policy.html     Required for store submissions
├── icons/
│   ├── icon-192.png        PWA icon (barcode-themed, dark bg)
│   └── icon-512.png
├── Inventory_Template.csv  Reference column structure
├── CHANGELOG.md
├── LICENSE                 MIT
└── README.md
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| App | Vanilla JS PWA — no framework, no build step |
| Barcode scanning | BarcodeDetector API (Chrome on Android) |
| Product lookup | Open Food Facts API |
| Vendor prices | UPCitemdb free trial API (100 lookups/day, cached per session) |
| Data storage | Google Sheets API v4 (direct browser → Sheets, no backend) |
| Auth | Google Identity Services (OAuth 2.0, hardcoded developer Client ID) |
| Hosting | GitHub Pages |
| Store packaging | [PWABuilder](https://pwabuilder.com) |

---

## Store Publishing

1. Go to [pwabuilder.com](https://pwabuilder.com)
2. Paste `https://xwxexixrxdxox-spec.github.io/ISC/`
3. Download the Android (`.aab`) or Windows (`.msix`) package
4. Submit via [Google Play Console](https://play.google.com/console) ($25 one-time) or [Microsoft Partner Center](https://partner.microsoft.com/dashboard) (free)

For public Play Store listing, the OAuth consent screen must be verified by Google (submit via Google Cloud Console → APIs & Services → OAuth consent screen → Publish). The `privacy-policy.html` is already live at `https://xwxexixrxdxox-spec.github.io/ISC/privacy-policy.html` and meets the minimum requirements for submission.

---

## Known Limitations

- **Barcode coverage:** Open Food Facts covers retail/grocery strongly. Industrial, B2B, or custom SKUs may not match — type the description once and it saves permanently to your sheet.
- **Vendor prices:** UPCitemdb free tier allows 100 lookups/day per IP. Coverage is strongest on US retail. Results are cached per session so repeated scans of the same item do not count against the limit.
- **Google Sheets app on Android:** There is no reliable programmatic way to open the Google Sheets native app from a web page in Chrome for `docs.google.com` URLs — Chrome intercepts intent URLs for Google-owned domains before they reach Android's intent system. The reliable path is to tap View Sheet (opens a Chrome tab) and then tap Chrome's built-in "Open in app" banner that appears at the top of the page.
- **OAuth test users:** The app is in Testing mode on Google Cloud. Users must be added manually in the OAuth consent screen test users list until the app is verified.
- **Token expiry:** OAuth tokens last 60 minutes. The app silently refreshes at 50 minutes. Very long idle sessions may require a tap to re-authenticate.

---

## License

MIT — see [LICENSE](./LICENSE)
