function wwwVariant(origin: string): string | null {
  try {
    const url = new URL(origin);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

    const host = url.hostname;
    if (host === 'localhost' || host.includes(':')) return null;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return null;
    if (!host.includes('.')) return null;

    const variant = new URL(origin);
    variant.hostname = host.startsWith('www.') ? host.slice(4) : `www.${host}`;
    return variant.origin;
  } catch {
    return null;
  }
}

/**
 * Allow both the apex and `www.` host for every configured web origin, so a
 * shop that is served on `www.example.com` still works when the environment
 * lists `https://example.com` (and vice versa).
 */
export function expandOrigins(configured: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  const add = (origin: string): void => {
    if (seen.has(origin)) return;
    seen.add(origin);
    result.push(origin);
  };

  for (const raw of configured.split(',')) {
    const origin = raw.trim();
    if (!origin) continue;
    add(origin);
    const variant = wwwVariant(origin);
    if (variant) add(variant);
  }

  return result;
}
