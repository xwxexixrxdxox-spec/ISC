/**
 * INVENTORY CONTROL — GOOGLE SHEETS BACKEND
 * ------------------------------------------
 * SETUP (one time, ~10 minutes):
 * 1. Go to sheets.google.com, create a new sheet, name it "Inventory".
 * 2. In row 1, add these column headers exactly:
 *    Barcode | Description | Quantity | LastUpdated
 * 3. In the Sheet, go to Extensions > Apps Script.
 * 4. Delete any placeholder code and paste this entire file in.
 * 5. Click Deploy > New deployment.
 *    - Type: Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 6. Click Deploy, authorize the permissions it asks for.
 * 7. Copy the Web App URL it gives you (ends in /exec).
 * 8. Paste that URL into the app's Settings panel.
 *
 * NOTE: All requests (including stock updates) use GET, not POST.
 * This avoids a known issue where fetch() + POST + Apps Script's
 * redirect response silently drops the request body in some browsers.
 */

const SHEET_NAME = 'Inventory';

function doGet(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const barcode = String(e.parameter.barcode || '').trim();

  if (!barcode) {
    return jsonResponse({ ok: false, error: 'Provide ?barcode=' });
  }

  if (e.parameter.action === 'update') {
    const description = String(e.parameter.description || '').trim();
    const qtyChange = Number(e.parameter.qtyChange) || 0;
    const timestamp = e.parameter.timestamp || new Date().toISOString();

    const values = sheet.getDataRange().getValues();
    let rowIndex = -1;
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][0]).trim() === barcode) {
        rowIndex = i + 1;
        break;
      }
    }

    let newQty;
    if (rowIndex === -1) {
      newQty = Math.max(qtyChange, 0);
      sheet.appendRow([barcode, description, newQty, timestamp]);
    } else {
      const currentQty = Number(values[rowIndex - 1][2]) || 0;
      newQty = Math.max(currentQty + qtyChange, 0);
      sheet.getRange(rowIndex, 3).setValue(newQty);
      sheet.getRange(rowIndex, 4).setValue(timestamp);
      if (description && !values[rowIndex - 1][1]) {
        sheet.getRange(rowIndex, 2).setValue(description);
      }
    }
    return jsonResponse({ ok: true, newQty: newQty });
  }

  // Plain lookup (no action param)
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]).trim() === barcode) {
      return jsonResponse({ ok: true, description: values[i][1], qty: values[i][2] });
    }
  }
  return jsonResponse({ ok: true, found: false });
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
