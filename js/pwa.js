/**
 * pwa.js -- PWA install prompt and service worker registration.
 * Captures the beforeinstallprompt event and shows a non-intrusive banner once.
 */

let deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstallPrompt = e;
  if (!localStorage.getItem('installDismissed')) {
    document.getElementById('install-banner')?.classList.remove('hidden');
  }
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  document.getElementById('install-banner')?.classList.add('hidden');
  console.log('[PWA] App installed');
});

/** Show iOS-specific "Add to Home Screen" instructions.
 * iOS Safari does not fire beforeinstallprompt -- users must add manually
 * via the Share menu. This banner guides them through it once.
 */
export function initIOSInstallHint() {
  const isIOS = /ipad|iphone|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isSafari = /safari/i.test(navigator.userAgent) && !/chrome|crios|fxios/i.test(navigator.userAgent);
  const isStandalone = window.navigator.standalone === true;

  if (!isIOS || !isSafari || isStandalone || localStorage.getItem('iosHintSeen')) return;

  // Small delay so the app finishes loading before the hint appears
  setTimeout(() => {
    const hint = document.createElement('div');
    hint.id = 'ios-install-hint';
    hint.style.cssText = [
      'position:fixed;bottom:70px;left:12px;right:12px;z-index:500',
      'background:#1e3a5f;border:1px solid #3b82f6;border-radius:10px',
      'padding:14px;box-shadow:0 4px 20px rgba(0,0,0,0.5);line-height:1.5'
    ].join(';');
    hint.innerHTML = '<div style="color:#93c5fd;font-weight:700;font-size:0.85rem;margin-bottom:6px;">Install on iPhone / iPad</div>'
      + '<div style="color:#cbd5e1;font-size:0.8rem;">'
      + 'Tap the <b style="color:#f1f5f9;">Share</b> button '
      + '(<span style="font-size:1rem;">&#x2B06;</span> at the bottom of Safari) '
      + 'then tap <b style="color:#f1f5f9;">Add to Home Screen</b>.'
      + '</div>'
      + '<div style="text-align:right;margin-top:10px;">'
      + '<button id="ios-hint-dismiss" style="background:#3b82f6;color:white;border:none;'
      + 'border-radius:6px;padding:7px 14px;font-size:0.8rem;font-weight:700;cursor:pointer;">'
      + 'Got it</button>'
      + '</div>';
    document.body.appendChild(hint);
    document.getElementById('ios-hint-dismiss')?.addEventListener('click', () => {
      localStorage.setItem('iosHintSeen', '1');
      hint.remove();
    });
    // Auto-dismiss after 15 seconds
    setTimeout(() => hint.remove(), 15000);
  }, 2000);
}

export function initInstallBanner() {
  const accept  = document.getElementById('install-accept');
  const dismiss = document.getElementById('install-dismiss');

  accept?.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    console.log('[PWA] Install outcome:', outcome);
    deferredInstallPrompt = null;
    document.getElementById('install-banner')?.classList.add('hidden');
  });

  dismiss?.addEventListener('click', () => {
    localStorage.setItem('installDismissed', '1');
    document.getElementById('install-banner')?.classList.add('hidden');
  });
}

/** Register the service worker */
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./service-worker.js')
    .then(() => console.log('[SW] Registered'))
    .catch(e  => console.warn('[SW] Failed:', e));
}
