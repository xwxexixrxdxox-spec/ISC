# Inventory Scanner — Setup Guide

## What you have
- `inventory_app.html` — the scanner app. Works in any phone browser right now; no install needed.
- `google_apps_script.gs` — the backend that connects the app to your Google Sheet.
- `Inventory_Template.csv` — starter sheet structure, import this first.

## Setup (10 minutes)

1. **Create the sheet.** Go to sheets.google.com → new sheet → name it whatever you like.
   Import `Inventory_Template.csv` (File > Import > Upload) or just type the four
   column headers yourself: `Barcode | Description | Quantity | LastUpdated`.

2. **Add the backend.** In that Sheet: Extensions > Apps Script. Delete the placeholder
   code, paste in everything from `google_apps_script.gs`. Save.

3. **Deploy it.** Click Deploy > New deployment > type "Web app" > Execute as "Me" >
   Who has access "Anyone" > Deploy. Approve the permissions prompt. Copy the URL
   ending in `/exec`.

4. **Connect the app.** Open `inventory_app.html` on your phone (host it anywhere —
   even just AirDrop/email it to yourself and open in Chrome/Safari, or I can help you
   host it on a free static site if you want a permanent link). Tap Settings, paste
   the `/exec` URL, save.

5. **Scan something.** Tap "Scan Barcode," point at any product barcode. It'll try a
   public lookup (Open Food Facts — strong for groceries/consumer goods, weak for
   anything niche or industrial). If nothing comes back, type the description once;
   it's saved to your sheet permanently so future scans of that code auto-fill.

6. Your Google Sheet is now the live, editable spreadsheet — open it on your PC
   anytime, edit cells directly if needed, and it'll stay in sync since the app and
   the sheet are the same data, not a copy.

## About the barcode lookup source
You picked "not sure yet," so I wired in Open Food Facts since it's free, has no API
key requirement, and has solid coverage for retail/food/consumer products. If your
inventory is more industrial, B2B, or has custom SKUs, the public lookup will mostly
return nothing — that's expected, and the "type once, remember forever" fallback
handles it. If you tell me more about what you're actually stocking, I can swap in a
better-matched source (e.g., UPCitemdb, Barcode Lookup API, or a fully private list
you supply).

## About the app stores
This HTML app works today on any phone browser, and on Android you can literally
"Add to Home Screen" so it behaves like an installed app. To get it formally listed
on the Google Play Store or Microsoft Store, you'd need:
- A registered developer account (~$25 one-time for Google Play, ~$19/free for
  Microsoft depending on account type)
- The app packaged via a tool like Bubblewrap or PWABuilder (turns this exact HTML
  app into an installable Android/Windows package — no rewrite needed)
- Store listing assets (icon, screenshots, description) and passing store review

I can walk you through that packaging step whenever you're ready to actually publish
— it's a separate, mostly administrative process from the app itself, which is
already functional.
