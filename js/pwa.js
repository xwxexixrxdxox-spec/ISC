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
