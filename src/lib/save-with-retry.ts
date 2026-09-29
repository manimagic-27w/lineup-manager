/**
 * Retries an async save a couple of times with a short, increasing delay before giving up.
 * Written for game-day screens (availability, the lineup board) where a save is a Server
 * Action fired from a sideline connection that might drop one packet and be fine a second
 * later - most of those blips resolve within a retry or two without the coach ever noticing,
 * while a real failure (actually offline, a genuine server error) still surfaces after a
 * bounded number of attempts instead of retrying forever or hanging silently.
 */
export async function saveWithRetry(save: () => Promise<unknown>, attempts = 3, baseDelayMs = 600) {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      await save();
      return;
    } catch (err) {
      lastError = err;
      if (attempt < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, baseDelayMs * (attempt + 1)));
      }
    }
  }
  throw lastError;
}
