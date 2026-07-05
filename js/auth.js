/**
 * auth.js -- Google Identity Services OAuth flow.
 * Token request, silent background refresh, and ensureToken helper.
 */

import { S, CLIENT_ID } from './state.js';
import { setStatus }     from './utils.js';

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive',
].join(' ');

/** Request an access token via GIS popup. Calls callback on success. */
export function requestToken(callback) {
  try {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope:     SCOPES,
      callback:  resp => {
        if (resp.error) {
          const msg =
            resp.error === 'popup_closed_by_user' ? 'Sign-in window was closed -- tap the button again.' :
            resp.error === 'access_denied'         ? 'Access denied. Please allow the required permissions.' :
            'Sign-in failed: ' + resp.error;
          setStatus('connectStatus', msg, 'err');
          resetSignInBtn();
          return;
        }
        S.accessToken = resp.access_token;
        scheduleTokenRefresh();
        callback();
      },
    });
    client.requestAccessToken({ prompt: 'select_account' });
  } catch (e) {
    setStatus('connectStatus', 'Could not open sign-in: ' + e.message, 'err');
    resetSignInBtn();
  }
}

/** Re-enable the sign-in button after any failure */
function resetSignInBtn() {
  const btn = document.getElementById('connectGoogleBtn');
  if (btn) {
    btn.disabled  = false;
    btn.innerHTML = '<span style="font-size:1.1rem;">G</span> &nbsp;Sign in with Google';
  }
}

/**
 * Schedule a silent token refresh 10 minutes before the 60-min expiry.
 * Clears any existing timer first so only one is ever active.
 */
export function scheduleTokenRefresh() {
  if (S.tokenTimer) clearTimeout(S.tokenTimer);
  S.tokenTimer = setTimeout(silentTokenRefresh, 50 * 60 * 1000);
}

function silentTokenRefresh() {
  try {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope:     SCOPES,
      callback:  resp => {
        if (!resp.error) {
          S.accessToken = resp.access_token;
          scheduleTokenRefresh();
          console.log('[Auth] Token silently refreshed');
          // Good opportunity to flush any queued offline writes
          import('./offline.js').then(m => m.flushOfflineQueue());
        }
      },
    });
    client.requestAccessToken({ prompt: '' });
  } catch (e) {
    console.warn('[Auth] Silent refresh failed:', e.message);
  }
}

/**
 * Ensure we have a valid access token before making API calls.
 * If the token is missing (page reload), triggers a silent re-auth.
 */
export function ensureToken() {
  if (S.accessToken) return Promise.resolve();
  return new Promise(resolve => {
    try {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope:     SCOPES,
        callback:  resp => {
          if (!resp.error) { S.accessToken = resp.access_token; scheduleTokenRefresh(); }
          resolve();
        },
      });
      client.requestAccessToken({ prompt: '' });
    } catch (e) {
      console.warn('[Auth] ensureToken failed:', e.message);
      resolve();
    }
  });
}

/**
 * Attempt a completely silent token acquisition.
 * Succeeds if the user has already authorized this app's scopes.
 * Returns true on success, false if interaction is needed.
 * Called on app load so returning users skip the welcome screen.
 */
export function trySilentToken() {
  return new Promise(resolve => {
    if (!window.google?.accounts?.oauth2) { resolve(false); return; }

    // Safety timeout -- if GIS takes more than 4 seconds to respond
    // silently, give up and show the welcome screen rather than hanging.
    const timeout = setTimeout(() => resolve(false), 4000);

    try {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: resp => {
          clearTimeout(timeout);
          if (!resp.error && resp.access_token) {
            S.accessToken = resp.access_token;
            scheduleTokenRefresh();
            resolve(true);
          } else {
            resolve(false);
          }
        },
        error_callback: () => { clearTimeout(timeout); resolve(false); },
      });
      // Empty prompt = truly silent. If the user has not authorized or
      // their Google session has expired, this fails silently (no popup)
      // and the app shows the welcome screen with the Sign In button.
      client.requestAccessToken({ prompt: '' });
    } catch (e) {
      clearTimeout(timeout);
      resolve(false);
    }
  });
}
