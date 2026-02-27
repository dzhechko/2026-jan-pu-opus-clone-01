import dns from 'dns/promises';
import { createLogger } from './logger';

const logger = createLogger('ssrf-validator');

const MAX_REDIRECTS = 5;

/**
 * Checks if an IPv4 address falls within a private/reserved range.
 *
 * Blocked ranges:
 * - 10.0.0.0/8       (Private Class A)
 * - 172.16.0.0/12     (Private Class B)
 * - 192.168.0.0/16    (Private Class C)
 * - 127.0.0.0/8       (Loopback)
 * - 169.254.0.0/16    (Link-local / Cloud metadata)
 * - 0.0.0.0/8         (Unspecified)
 */
export function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return true; // Malformed = block
  }

  const [a, b] = parts as [number, number, number, number];

  // 0.0.0.0/8
  if (a === 0) return true;
  // 10.0.0.0/8
  if (a === 10) return true;
  // 127.0.0.0/8
  if (a === 127) return true;
  // 169.254.0.0/16 (link-local + cloud metadata like 169.254.169.254)
  if (a === 169 && b === 254) return true;
  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;

  return false;
}

/**
 * Checks if an IPv6 address is private/reserved.
 *
 * Blocked ranges:
 * - ::1               (Loopback)
 * - fc00::/7          (Unique local: fc00:: and fd00::)
 * - fe80::/10         (Link-local)
 * - ::ffff:x.x.x.x   (IPv4-mapped — delegates to IPv4 check)
 */
export function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase().trim();

  // Loopback
  if (normalized === '::1') return true;

  // IPv4-mapped IPv6 (::ffff:10.0.0.1)
  const v4MappedMatch = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (v4MappedMatch) {
    return isPrivateIPv4(v4MappedMatch[1]!);
  }

  // Unique local (fc00::/7 covers fc00:: through fdff::)
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;

  // Link-local (fe80::/10)
  if (normalized.startsWith('fe80')) return true;

  return false;
}

/**
 * Returns true if the given IP address (v4 or v6) is private/reserved.
 */
export function isPrivateIP(ip: string): boolean {
  if (ip.includes(':')) {
    return isPrivateIPv6(ip);
  }
  return isPrivateIPv4(ip);
}

export type UrlSafetyResult =
  | { safe: true }
  | { safe: false; reason: string };

/**
 * Validates a URL against SSRF attacks by:
 * 1. Checking the scheme is http or https
 * 2. Resolving DNS to get actual IP addresses
 * 3. Blocking private/reserved IP ranges
 *
 * Must be called before making any HTTP request to the URL.
 */
export async function validateUrlSafety(url: string): Promise<UrlSafetyResult> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { safe: false, reason: 'Invalid URL' };
  }

  // Scheme check
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { safe: false, reason: `Unsupported scheme: ${parsed.protocol}` };
  }

  // Block URLs with credentials (user:pass@host)
  if (parsed.username || parsed.password) {
    return { safe: false, reason: 'URLs with credentials are not allowed' };
  }

  const hostname = parsed.hostname;

  // If hostname is already an IP literal, check directly
  if (isIPLiteral(hostname)) {
    const ip = hostname.replace(/^\[|\]$/g, ''); // strip IPv6 brackets
    if (isPrivateIP(ip)) {
      logger.warn({ event: 'ssrf_blocked', url, ip, reason: 'private IP literal' });
      return { safe: false, reason: 'Blocked: private IP address' };
    }
    return { safe: true };
  }

  // Resolve DNS
  const ips = await resolveDNS(hostname);
  if (ips.length === 0) {
    return { safe: false, reason: 'DNS resolution failed: no addresses found' };
  }

  // Check ALL resolved IPs — block if ANY is private
  for (const ip of ips) {
    if (isPrivateIP(ip)) {
      logger.warn({ event: 'ssrf_blocked', url, hostname, ip, reason: 'private IP in DNS' });
      return { safe: false, reason: 'Blocked: private IP address' };
    }
  }

  return { safe: true };
}

/**
 * Performs a streaming HTTP fetch with SSRF protection and redirect handling.
 * Returns the final Response object.
 *
 * - Re-validates SSRF on each redirect
 * - Maximum 5 redirects
 * - Timeout via AbortSignal
 */
export async function safeFetch(
  url: string,
  signal: AbortSignal,
): Promise<Response> {
  let currentUrl = url;
  let redirectCount = 0;

  for (;;) {
    const safety = await validateUrlSafety(currentUrl);
    if (!safety.safe) {
      throw new Error(safety.reason);
    }

    const response = await fetch(currentUrl, {
      redirect: 'manual',
      signal,
      headers: {
        'User-Agent': 'ClipMaker/1.0',
      },
    });

    const status = response.status;

    // Follow redirects manually to validate each target
    if (status >= 300 && status < 400) {
      // Consume response body to release the connection
      try {
        await response.body?.cancel();
      } catch {
        // Ignore errors when discarding redirect body
      }

      redirectCount++;
      if (redirectCount > MAX_REDIRECTS) {
        throw new Error('Too many redirects');
      }

      const location = response.headers.get('location');
      if (!location) {
        throw new Error(`Redirect ${status} without Location header`);
      }

      // Resolve relative redirects against current URL
      currentUrl = new URL(location, currentUrl).toString();
      logger.info({ event: 'download_redirect', from: url, to: currentUrl, redirectCount });
      continue;
    }

    return response;
  }
}

/**
 * Resolves a hostname to all IPv4 and IPv6 addresses.
 * Returns an empty array on DNS failure.
 */
async function resolveDNS(hostname: string): Promise<string[]> {
  const ips: string[] = [];

  try {
    const v4 = await dns.resolve4(hostname);
    ips.push(...v4);
  } catch {
    // No A records — acceptable if AAAA exists
  }

  try {
    const v6 = await dns.resolve6(hostname);
    ips.push(...v6);
  } catch {
    // No AAAA records — acceptable if A exists
  }

  return ips;
}

/**
 * Returns true if the string looks like an IP address literal
 * (not a hostname that needs DNS resolution).
 */
function isIPLiteral(hostname: string): boolean {
  // IPv4: digits and dots
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return true;
  // IPv6: contains colon (may be wrapped in brackets)
  if (hostname.includes(':')) return true;
  return false;
}
