const HEALTH_PROBE_MS = 1500;

export async function detectOffline(
  fetchImpl: typeof fetch = fetch,
  online: boolean | undefined = typeof navigator === 'undefined' ? undefined : navigator.onLine,
): Promise<boolean> {
  if (online === false) return true;
  if (typeof fetchImpl !== 'function') return false;

  try {
    const controller = typeof AbortController === 'undefined' ? undefined : new AbortController();
    const timer = controller ? setTimeout(() => controller.abort(), HEALTH_PROBE_MS) : undefined;
    const response = await fetchImpl('/api/health', {
      cache: 'no-store',
      method: 'GET',
      signal: controller?.signal,
    });
    if (timer) clearTimeout(timer);
    return !response.ok;
  } catch {
    return true;
  }
}
