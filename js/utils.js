/**
 * utils.js -- Pure utility functions with no side effects.
 * No imports from other app modules -- safe to import anywhere.
 */

/** Shorthand for getElementById */
export function $(id) { return document.getElementById(id); }

/** Set a status message inside any element */
export function setStatus(id, msg, type) {
  const el = $(id);
  if (el) el.innerHTML = msg
    ? `<div class="status ${type}">${msg}</div>`
    : '';
}

/**
 * Retry wrapper with exponential backoff.
 * Retries on 429 (rate limit) and 503 (service unavailable) only.
 * All other errors are thrown immediately.
 */
export async function withRetry(fn, maxAttempts = 3, baseDelayMs = 1000) {
  let lastErr;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const retryable = e.message.includes('429') || e.message.includes('503')
        || e.message.includes('rate limit') || e.message.includes('Service Unavailable');
      if (!retryable) throw e;
      const delay = baseDelayMs * Math.pow(2, attempt);
      console.warn(`[Retry] Attempt ${attempt + 1} failed: ${e.message}. Waiting ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
