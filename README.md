# 📦 Inventory Scanner

A mobile-first Progressive Web App for real-time inventory control. Scan barcodes with your phone camera, look up product info automatically, and track stock that syncs live to a Google Sheet — with a full audit log, offline support, and low stock alerts. 

[![Live App](https://img.shields.io/badge/Live%20App-GitHub%20Pages-22c55e?style=flat-square)](https://xwxexixrxdxox-spec.github.io/ISC/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](./LICENSE)
[![PWA Ready](https://img.shields.io/badge/PWA-Ready-7c3aed?style=flat-square)](https://pwabuilder.com)

---

## Features

| Feature | Details |
|---|---|
| 📷 Barcode scanning | BarcodeDetector API — no extra hardware. Requires 3 consecutive reads to reject false positives. |
| 🏷 Auto product lookup | Open Food Facts — name, unit, and estimated price auto-filled from barcode |
| 📊 Live Google Sheets sync | Direct Sheets API writes — no middleman server |
| ⚡ Auto setup | Signs in with Google, creates your sheet and History tab automatically |
| 📡 Offline queue | Scans queue locally when offline and auto-sync on reconnect |
| 📋 Audit log | Every stock change recorded to a History tab with full timestamp |
| ⚠️ Low stock alerts | Set minimum quantities per item; low items bubble to top of list with badge |
| 🔄 Token refresh | OAuth tokens silently refreshed at 50 min — sessions never expire mid-scan |
| 📱 Installable PWA | Add to home screen, or package for Google Play / Microsoft Store via PWABuilder |

---

## Initial Setup (~10 minutes, one time only)

### 1. Google Cloud Project

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → **New Project** (name it anything)
2. **APIs & Services → Library** → enable:
   - **Google Sheets API**
   - **Google Drive API**
3. **APIs & Services → OAuth consent screen**
   - Choose **External** → fill in app name + email → Save
   - Under **Test users** → **+ Add Users** → add your Gmail address
4. **Credentials → Create Credentials → OAuth Client ID**
   - Type: **Web application**
   - Authorized JavaScript origins: `https://xwxexixrxdxox-spec.github.io`
   - Click **Create** → copy the **Client ID**

### 2. Open the App

1. Go to [https://xwxexixrxdxox-spec.github.io/ISC/](https://xwxexixrxdxox-spec.github.io/ISC/)
2. Paste your Client ID → **Save & Continue**
3. Tap **Connect Google Account** → sign in
4. The app auto-creates your Google Sheet and lands on the scanner

---

## Daily Use

### Scanning
Tap **📷 Scan Barcode**, point at any product barcode and hold steady — the progress bar fills to 100% as it confirms the read. The description, unit, and price auto-fill from public data where available.

### Adjusting stock
Enter the quantity, then tap **+ Add Stock** or **− Remove**. The sheet updates in real time. Changes while offline are queued and sync automatically.

### Inventory view
Tap the **📦 Inventory** tab to browse all items, search by name or barcode, and see stock levels. Tap any item to set a low-stock alert threshold.

### Low stock alerts
Items at or below their threshold show a ⚠ badge and sort to the top of the list. The inventory tab also shows a red badge count.

### Audit log
Every change is recorded in the **History** tab of your Google Sheet: timestamp, barcode, description, quantity change, and new total.

---

## Repo Structure

```
/
├── index.html              Main markup
├── css/
│   └── styles.css          All styles
├── js/
│   └── app.js              All application logic
├── manifest.json           PWA manifest
├── service-worker.js       Offline caching (network-first for HTML/JS/CSS)
├── privacy-policy.html     Required for store submissions
├── icons/
│   ├── icon-192.png
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
| Product lookup | Open Food Facts API + Prices API |
| Data storage | Google Sheets API v4 (direct from browser) |
| Auth | Google Identity Services (OAuth 2.0) |
| Hosting | GitHub Pages |
| Store packaging | [PWABuilder](https://pwabuilder.com) |

---

## Store Publishing

This app is PWA-ready. To package for stores:

1. Go to [pwabuilder.com](https://pwabuilder.com)
2. Paste `https://xwxexixrxdxox-spec.github.io/ISC/`
3. Download the Android (`.aab`) or Windows (`.msix`) package
4. Submit via [Google Play Console](https://play.google.com/console) ($25 one-time) or [Microsoft Partner Center](https://partner.microsoft.com/dashboard) (free)

---

## Notes

- **Barcode coverage:** Open Food Facts covers most retail/grocery products well. Industrial or custom SKUs may not match — type the description once and it's saved permanently.
- **Multiple users / teams:** Each user runs their own setup and gets their own Google Sheet. For shared team inventory, one user can share their sheet URL with teammates who can view/edit it directly in Google Sheets while one phone handles scanning.
- **Token expiry:** OAuth tokens last 60 minutes. The app silently refreshes them at 50 minutes. If you leave the app open for a very long time without scanning, a Google sign-in prompt may briefly appear on the next scan.

---

## License

MIT — see [LICENSE](./LICENSE)
