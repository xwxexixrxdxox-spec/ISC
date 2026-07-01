# Inventory Scanner — Setup Guide

## What you have
- `inventory_app.html` — the scanner app. Works in any phone browser right now; no install needed.
- `google_apps_script.gs` — the backend that connects the app to your Google Sheet.
- `Inventory_Template.csv` — starter sheet structure, import this first.

## Setup (10 minutes)

1. **Create the sheet.** Go to sheets.google.com → new sheet → name it whatever you like.
   Import `Inventory_Template.csv` (File > Import > Upload) or just type the four
   column headers yourself: `Barcode | Description | Quantity | LastUpdated`.
   Rename first table to "Inventory".

2. **Add the backend.** In that Sheet: Extensions > Apps Script. Delete the placeholder
   code, paste in everything from `google_apps_script.gs`. Save.

3. **Deploy it.** Click Deploy > New deployment > type "Web app" > Execute as "Me" >
   Who has access "Anyone" > Deploy. Approve the permissions prompt. Copy the URL
   ending in `/exec`.

4. **Connect the app.** Open `inventory_app.html` on your phone (host it anywhere —
   even just AirDrop/email it to yourself and open in Chrome/Safari. Tap Settings, paste
   the `/exec` URL, save.

5. **Scan something.** Tap "Scan Barcode," point at any product barcode. It'll try a
   public lookup (Open Food Facts — strong for groceries/consumer goods, weak for
   anything niche or industrial). If nothing comes back, type the description once;
   it's saved to your sheet permanently so future scans of that code auto-fill.

6. Your Google Sheet is now the live, editable spreadsheet — open it on your PC
   anytime, edit cells directly if needed, and it'll stay in sync since the app and
   the sheet are the same data, not a copy.
