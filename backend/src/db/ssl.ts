const MANAGED_HOSTS = ['neon.tech', 'render.com', 'supabase.co', 'railway.app'];

export type SslConfig = false | { rejectUnauthorized: boolean };

function hostFromConnectionString(connectionString: string): string | null {
  try {
    return new URL(connectionString).hostname.toLowerCase();
  } catch {
    const match = connectionString.match(/@([^/:?]+)/);
    return match?.[1]?.toLowerCase() ?? null;
  }
}

function sslModeFromConnectionString(connectionString: string): string | null {
  try {
    return new URL(connectionString).searchParams.get('sslmode')?.toLowerCase() ?? null;
  } catch {
    const match = connectionString.match(/[?&]sslmode=([^&]+)/i);
    const mode = match?.[1];
    return mode ? decodeURIComponent(mode).toLowerCase() : null;
  }
}

/**
 * Managed Postgres providers (Neon, Render, Supabase, Railway) require SSL even
 * when the connection string omits `sslmode`. Local Postgres does not.
 */
export function resolveSslConfig(connectionString: string): SslConfig {
  const sslMode = sslModeFromConnectionString(connectionString);
  if (sslMode === 'disable' || sslMode === 'allow' || sslMode === 'prefer') return false;
  if (sslMode === 'verify-ca' || sslMode === 'verify-full') {
    return { rejectUnauthorized: true };
  }
  if (sslMode) return { rejectUnauthorized: false };

  const host = hostFromConnectionString(connectionString);
  if (!host) return false;

  const isManaged = MANAGED_HOSTS.some((domain) => host === domain || host.endsWith(`.${domain}`));
  return isManaged ? { rejectUnauthorized: false } : false;
}

/**
 * pg-connection-string warns about `sslmode=require` and may change its
 * semantics in pg v9. SSL is resolved explicitly above, so remove the parameter
 * before handing the URL to pg.
 */
export function connectionStringWithoutSslMode(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    url.searchParams.delete('sslmode');
    url.searchParams.delete('uselibpqcompat');
    return url.toString();
  } catch {
    return connectionString
      .replace(/([?&])(sslmode|uselibpqcompat)=[^&]*/gi, '$1')
      .replace(/[?&]$/, '');
  }
}
