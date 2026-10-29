import dns from 'node:dns';
import net from 'node:net';

let configured = false;

/**
 * Prefer IPv4 when resolving outbound hosts. Node's happy-eyeballs can hang on
 * blackholed IPv6 routes while the IPv4 addresses connect normally (seen with
 * Neon on some networks). IPv6 is still used when no IPv4 address exists.
 */
export function preferIpv4(): void {
  if (configured) return;
  configured = true;
  dns.setDefaultResultOrder('ipv4first');
  if (typeof net.setDefaultAutoSelectFamily === 'function') {
    net.setDefaultAutoSelectFamily(false);
  }
}
