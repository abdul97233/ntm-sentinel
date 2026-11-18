import { hostnameSchema, isIPAddress, isPrivateOrReservedIP, normalizeHostname } from '@ntm/shared';

/**
 * Reduce user input to a validated public hostname. The backend never fetches
 * this hostname/URL; it is only forwarded to fixed, trusted reputation providers.
 */

const BLOCKED_SUFFIXES = [
  'localhost',
  'local',
  'internal',
  'intranet',
  'lan',
  'home',
  'corp',
  'localdomain',
  'home.arpa',
  'test',
  'invalid',
  'example',
  'onion',
];

export type HostnameResult = { ok: true; hostname: string } | { ok: false; reason: string };

export function validatePublicHostname(raw: string): HostnameResult {
  const host = normalizeHostname(raw);
  if (!host) return { ok: false, reason: 'hostname is empty' };
  if (isIPAddress(host) || isPrivateOrReservedIP(host)) {
    return { ok: false, reason: 'IP addresses are not accepted; submit a domain name' };
  }
  // Numeric-only or hex-like hosts can be alternative IP encodings (e.g. 2130706433, 0x7f000001).
  if (/^(0x[0-9a-f]+|\d+)(\.(0x[0-9a-f]+|\d+))*$/i.test(host)) {
    return { ok: false, reason: 'numeric hosts are not accepted' };
  }
  const parsed = hostnameSchema.safeParse(host);
  if (!parsed.success) return { ok: false, reason: 'invalid hostname' };
  const h = parsed.data;
  if (!h.includes('.')) return { ok: false, reason: 'single-label hostnames are not accepted' };
  if (BLOCKED_SUFFIXES.some((s) => h === s || h.endsWith('.' + s))) {
    return { ok: false, reason: 'private or reserved hostnames are not accepted' };
  }
  return { ok: true, hostname: h };
}

/** Extract the hostname from a submitted http(s) URL. Other schemes are rejected. */
export function hostnameFromUrl(raw: string): HostnameResult {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: 'invalid URL' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: 'only http and https URLs are accepted' };
  }
  return validatePublicHostname(url.hostname);
}
