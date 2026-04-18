/**
 * Fetch wrapper with automatic 429 back-off.
 *
 * When the server returns 429 Too Many Requests, this module:
 * 1. Reads the Retry-After header (seconds) and queues the retry.
 * 2. Exponentially backs off if the header is missing.
 * 3. Rejects if max retries are exhausted.
 *
 * Import and use in place of raw `fetch()` for API calls.
 */

const MAX_RETRIES = 3;
const DEFAULT_BACKOFF_MS = 2000;

/**
 * @param {RequestInfo | URL} input
 * @param {RequestInit} [init]
 * @returns {Promise<Response>}
 */
export async function apiFetch(input, init) {
  let lastResponse;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    lastResponse = await fetch(input, init);
    if (lastResponse.status !== 429) return lastResponse;

    // Server said slow down
    const retryAfter = lastResponse.headers.get("retry-after");
    let delayMs;
    if (retryAfter && /^\d+$/.test(retryAfter.trim())) {
      delayMs = parseInt(retryAfter, 10) * 1000;
    } else {
      delayMs = DEFAULT_BACKOFF_MS * 2 ** attempt;
    }
    // Add jitter (±25%) to stagger retries from multiple clients
    const jitter = delayMs * 0.25 * (Math.random() * 2 - 1);
    await new Promise((r) => setTimeout(r, Math.max(100, delayMs + jitter)));
  }
  return /** @type {Response} */ (lastResponse);
}
