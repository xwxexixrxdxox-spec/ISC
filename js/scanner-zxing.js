/**
 * scanner-zxing.js -- ZXing-js barcode decoder for browsers without
 * native BarcodeDetector (iOS Safari, Firefox, desktop Safari).
 *
 * This file is NEVER imported on Android Chrome or desktop Chrome/Edge
 * because scanner.js only imports it when BarcodeDetector is absent.
 * iOS users pay the download cost once; it is cached by the browser after.
 *
 * Exports a single function: loadZXingDecoder()
 * Returns an object with a decode(canvas) method that matches the shape
 * of a BarcodeDetector result so the scan loop in scanner.js is identical
 * on every platform.
 */

let cachedDecoder = null;

/**
 * Load ZXing from CDN and return a decoder object.
 * Tries jsDelivr first (broad iOS compatibility), falls back to esm.sh.
 * Caches the decoder after first call so subsequent scans are instant.
 *
 * @param {function} onStatus - called with (message, type) for UI updates
 * @returns {{ decode: function(HTMLCanvasElement): string }}
 */
export async function loadZXingDecoder(onStatus) {
  if (cachedDecoder) return cachedDecoder;

  onStatus('Loading scanner library (1/3)...', 'info');

  let zxingModule = null;

  // Primary CDN: jsDelivr -- widely used, strong iOS Safari track record
  try {
    zxingModule = await import('https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.4/+esm');
    if (!zxingModule?.BrowserMultiFormatReader) throw new Error('BrowserMultiFormatReader missing');
  } catch (e) {
    console.warn('[ZXing] jsDelivr failed (' + e.message + '), trying esm.sh...');
    onStatus('Loading scanner library (retrying)...', 'info');
    // Fallback CDN: esm.sh
    try {
      zxingModule = await import('https://esm.sh/@zxing/browser@0.1.4');
      if (!zxingModule?.BrowserMultiFormatReader) throw new Error('BrowserMultiFormatReader missing');
    } catch (e2) {
      throw new Error('Could not load scanner library: ' + e2.message);
    }
  }

  const reader = new zxingModule.BrowserMultiFormatReader();

  // Return a simple decode interface so scanner.js does not need to know
  // which CDN was used or how ZXing works internally.
  cachedDecoder = {
    decode(canvas) {
      // Throws NotFoundException if no barcode in frame -- expected behaviour.
      const result = reader.decodeFromCanvas(canvas);
      return result.getText();
    },
    reset() {
      // Call if the scanner is stopped and restarted to clear ZXing state
      try { reader.reset(); } catch (e) { /* ignore */ }
    }
  };

  return cachedDecoder;
}
