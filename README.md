# 📦 Inventory Scanner

A mobile-first Progressive Web App (PWA) for real-time inventory control. Scan product barcodes with your phone camera, look up public item descriptions automatically, and track stock levels that sync live to a Google Sheet you can view and edit from any device.

---

## Features

- **Barcode scanning** via phone camera — no extra hardware needed
- **Auto product lookup** from Open Food Facts public database
- **Live Google Sheets sync** — every scan updates your sheet in real time
- **Auto sheet creation** — your inventory spreadsheet is created automatically on first setup
- **Unit of measurement + price fields** — auto-populated where public data is available, freely editable
- **Works offline** — app loads without a connection; syncing requires internet
- **Installable** — add to your home screen on Android or iOS, or install via Google Play / Microsoft Store

---

## Initial Setup (~15 minutes, one time only)

### Step 1 — Google Cloud Project

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and sign in with the Google account you want to use for inventory
2. Click **Select a project → New Project**, give it any name, click **Create**
3. Go to **APIs & Services → Library** and enable these three APIs:
   - **Google Sheets API**
   - **Google Drive API**
   - **Apps Script API**
4. Go to **APIs & Services → OAuth consent screen**
   - Choose **External**, click **Create**
   - Fill in App name (e.g. "Inventory Scanner"), your email for support and developer contact
   - Click **Save and Continue** through the remaining steps
   - On the **Test users** screen, click **+ Add Users** and add the Gmail address you'll sign in with
   - Click **Save and Continue**, then **Back to Dashboard**
5. Go to **APIs & Services → Credentials → Create Credentials → OAuth Client ID**
   - Application type: **Web application**
   - Under **Authorized JavaScript origins**, click **+ Add URI** and enter:
     ```
     https://xwxexixrxdxox-spec.github.io
     ```
   - Click **Create**
   - Copy the **Client ID** that appears (it ends in `.apps.googleusercontent.com`)

---

### Step 2 — Enable Apps Script API (user setting)

This is a separate setting in your personal Google account, not the Cloud Console.

1. Go to [script.google.com/home/usersettings](https://script.google.com/home/usersettings)
2. Turn on **Google Apps Script API**

---

### Step 3 — Connect the App

1. Open the app at [https://xwxexixrxdxox-spec.github.io/ISC/](https://xwxexixrxdxox-spec.github.io/ISC/)
2. Paste your **Client ID** into the field on the first screen and tap **Save & Continue**
3. Tap **Connect Google Account** and sign in with the same Google account you added as a test user
4. The app will automatically:
   - Create a new Google Sheet in your Drive called **"Inventory Scanner — My Stock"**
   - Apply formatting (navy header, white data rows, borders)
   - Connect the app to your sheet
5. When setup completes you'll land on the scanner screen with a **View Sheet** button in the top corner

---

## Daily Use

### Scanning an item
1. Tap **📷 Scan Barcode**
2. Point your camera at the barcode and hold steady — the app confirms the read 3 times before accepting to avoid false reads
3. The item description, unit, and price auto-fill from public databases where available
4. Adjust the quantity field, then tap **+ Add Stock** or **− Remove**
5. Your Google Sheet updates in real time

### Viewing your inventory
Tap **📊 View Sheet** at the top of the scanner screen to open your Google Sheet in the browser. From there you can sort, filter, export to Excel, or edit any value directly.

### Manual barcode entry
If scanning isn't available (browser doesn't support it), type the barcode number directly into the Barcode field and tap the field — the app will attempt a public lookup automatically.

---

## Repo Structure

```
/
├── index.html          # Main app (scanner, OAuth flow, setup wizard)
├── manifest.json       # PWA manifest for store packaging
├── service-worker.js   # Offline caching, network-first for HTML
├── icons/
│   ├── icon-192.png
│   └── icon-512.png
├── Inventory_Template.csv   # Reference column structure
└── README.md
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| App | Vanilla JS PWA, single HTML file |
| Barcode scanning | BarcodeDetector API (Chrome on Android) |
| Product lookup | Open Food Facts public API |
| Data storage | Google Sheets (via Sheets API v4) |
| Auth | Google Identity Services (OAuth 2.0) |
| Hosting | GitHub Pages |
| Store packaging | PWABuilder |

---

## Notes

- **Barcode coverage:** Open Food Facts has strong coverage for retail/grocery products. Industrial, B2B, or custom SKUs may not return a match — type the description once and it's saved to your sheet permanently.
- **Session tokens:** Google OAuth tokens last ~1 hour. The app refreshes them automatically in the background when you scan.
- **Multiple users:** Each user runs their own setup and gets their own Google Sheet. There is currently no shared multi-user mode.
- **Store submission:** The app is PWA-ready and can be packaged for Google Play and Microsoft Store via [pwabuilder.com](https://pwabuilder.com). See the PWA score at that URL using the GitHub Pages link above.
