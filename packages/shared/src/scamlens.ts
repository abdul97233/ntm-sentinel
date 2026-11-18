/**
 * ScamLens local analysis. Every check produces an explainable Finding with the
 * exact evidence observed. No numeric "safety score" is produced and nothing here
 * can conclude that a site is safe — only which indicators were or were not observed.
 */
import type { Finding, RiskLevel, Severity } from './types';
import type { PageSnapshot } from './snapshot';
import {
  FREE_HOSTING_SUFFIXES,
  URL_SHORTENERS,
  hostMatchesDomain,
  isIPAddress,
  isIPv4,
  isPrivateOrReservedIP,
  levenshtein,
  registrableDomain,
  scriptsInLabel,
  subdomainLabels,
  tld,
  toUnicodeHostname,
} from './domain';

const SRC_URL = 'Local URL analysis';
const SRC_PAGE = 'Local page analysis';
const SRC_HEADERS = 'Response header probe';

/** Frequently impersonated brands: label -> official registrable domains. */
export const BRAND_DOMAINS: Record<string, string[]> = {
  paypal: ['paypal.com', 'paypal.me'],
  apple: ['apple.com', 'icloud.com'],
  icloud: ['icloud.com', 'apple.com'],
  microsoft: ['microsoft.com', 'live.com', 'office.com', 'microsoftonline.com'],
  office365: ['office.com', 'microsoft.com'],
  outlook: ['outlook.com', 'live.com', 'office.com'],
  google: ['google.com', 'youtube.com', 'gmail.com'],
  gmail: ['gmail.com', 'google.com'],
  amazon: ['amazon.com', 'amazon.co.uk', 'amazon.de', 'amazon.in', 'amazon.co.jp'],
  netflix: ['netflix.com'],
  facebook: ['facebook.com', 'fb.com'],
  instagram: ['instagram.com'],
  whatsapp: ['whatsapp.com'],
  linkedin: ['linkedin.com'],
  dropbox: ['dropbox.com'],
  docusign: ['docusign.com', 'docusign.net'],
  coinbase: ['coinbase.com'],
  binance: ['binance.com'],
  metamask: ['metamask.io'],
  chase: ['chase.com'],
  wellsfargo: ['wellsfargo.com'],
  bankofamerica: ['bankofamerica.com'],
  steam: ['steampowered.com', 'steamcommunity.com'],
  dhl: ['dhl.com'],
  fedex: ['fedex.com'],
  usps: ['usps.com'],
  adobe: ['adobe.com'],
  github: ['github.com'],
  wetransfer: ['wetransfer.com'],
};

/** TLDs disproportionately associated with abuse in public reporting. Weak signal on its own. */
const HIGH_ABUSE_TLDS = new Set([
  'zip', 'mov', 'top', 'xyz', 'tk', 'ml', 'ga', 'cf', 'gq', 'cfd', 'sbs', 'rest', 'bond',
  'icu', 'cyou', 'buzz', 'click', 'link', 'work', 'support', 'country', 'kim', 'loan', 'win',
]);

const CREDENTIAL_KEYWORDS = /(?:^|[-.])(login|signin|sign-in|verify|verification|secure|account|update|wallet|unlock|recover|confirm|billing|support|auth)(?:[-.]|$)/i;

const REDIRECT_PARAMS = /^(url|u|redirect|redirect_uri|redirect_url|return|returnto|return_url|next|dest|destination|target|goto|continue|out|r|link)$/i;

let findingSeq = 0;
function finding(
  id: string,
  title: string,
  severity: Severity,
  evidence: string,
  explanation: string,
  recommendation: string | undefined,
  source: string,
): Finding {
  findingSeq++;
  return { id, title, severity, evidence, explanation, recommendation, source };
}

function truncate(s: string, n = 140): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

export interface UrlAnalysis {
  findings: Finding[];
  hostname: string;
  unicodeHostname: string;
  registrableDomain: string;
}

/** Pure, synchronous URL checks. Safe to run on any string. */
export function analyzeUrl(rawUrl: string): UrlAnalysis {
  const findings: Finding[] = [];
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return {
      findings: [
        finding('url-invalid', 'URL could not be parsed', 'moderate', truncate(rawUrl), 'The address is not a valid URL, so it could not be analysed.', undefined, SRC_URL),
      ],
      hostname: '',
      unicodeHostname: '',
      registrableDomain: '',
    };
  }

  const host = url.hostname.toLowerCase();
  const bareHost = host.replace(/^\[|\]$/g, '');
  const unicodeHost = toUnicodeHostname(host);
  const reg = registrableDomain(bareHost);

  // Scheme
  if (url.protocol === 'data:' || url.protocol === 'javascript:' || url.protocol === 'blob:') {
    findings.push(
      finding('url-scheme', `Unusual URL scheme (${url.protocol})`, 'high', truncate(rawUrl, 80),
        `${url.protocol} URLs embed content directly instead of loading it from a site, a technique used to evade address-bar based checks.`,
        'Do not enter credentials on pages loaded this way.', SRC_URL),
    );
  }
  if (url.protocol === 'http:') {
    findings.push(
      finding('conn-http', 'Connection is not encrypted (HTTP)', isPrivateOrReservedIP(bareHost) || bareHost === 'localhost' ? 'low' : 'moderate', url.origin,
        'Data exchanged with this page can be read or modified by anyone on the network path.',
        'Avoid entering passwords, payment or personal details. Prefer the https:// version if one exists.', SRC_URL),
    );
  }

  // Host form
  if (isIPAddress(bareHost)) {
    const priv = isPrivateOrReservedIP(bareHost);
    findings.push(
      finding('url-ip-host', priv ? 'Address is a private/local IP' : 'Address is a raw IP instead of a domain name', priv ? 'info' : 'moderate', bareHost,
        priv
          ? 'This is a local or private network address (e.g. a router or development server).'
          : 'Legitimate public services almost always use domain names. Raw IP addresses are common in phishing and malware delivery.',
        priv ? undefined : 'Verify you expected to visit this address.', SRC_URL),
    );
  } else if (/^(0x[0-9a-f]+|\d{8,10})$/i.test(bareHost) || (/^[0-9a-fx.]+$/i.test(bareHost) && !isIPv4(bareHost) && /0x|^0\d/i.test(bareHost))) {
    findings.push(finding('url-encoded-ip', 'Obfuscated numeric host', 'high', bareHost, 'The host looks like an IP address written in hexadecimal, octal or integer form, a known obfuscation technique.', 'Treat this link with suspicion.', SRC_URL));
  }

  // IDN / punycode
  const punyLabels = host.split('.').filter((l) => l.startsWith('xn--'));
  if (punyLabels.length > 0) {
    const decodedLabels = unicodeHost.split('.');
    const mixed = decodedLabels.filter((l) => scriptsInLabel(l).size > 1);
    if (mixed.length > 0) {
      findings.push(
        finding('url-idn-mixed', 'Internationalized domain mixes writing systems', 'high', `${host} → ${unicodeHost}`,
          'Characters from different alphabets (e.g. Latin and Cyrillic) in one label can make a domain look identical to a well-known one (homograph attack).',
          'Check the domain carefully; navigate to important sites via bookmarks instead of links.', SRC_URL),
      );
    } else {
      findings.push(
        finding('url-idn', 'Internationalized (punycode) domain', 'low', `${host} → ${unicodeHost}`,
          'The domain contains non-ASCII characters. This is normal for many languages but is also used to imitate familiar domains.', undefined, SRC_URL),
      );
    }
  }

  // Credentials in URL
  if (url.username || url.password || rawUrl.replace(/^[a-z]+:\/\//i, '').split('/')[0]?.includes('@')) {
    findings.push(
      finding('url-userinfo', 'URL contains an "@" credential section', 'high', truncate(`${url.username}${url.password ? ':***' : ''}@${host}`),
        'Text before "@" in an address is ignored for navigation. Attackers use it to make a URL appear to point to a trusted site (e.g. https://paypal.com@evil.example).',
        'Look at the part after "@" — that is the real destination.', SRC_URL),
    );
  }

  // Subdomain depth
  const subs = subdomainLabels(bareHost);
  if (!isIPAddress(bareHost) && subs.length >= 4) {
    findings.push(
      finding('url-subdomains', 'Excessive number of subdomains', 'moderate', `${subs.length} subdomain levels: ${truncate(host)}`,
        'Long chains of subdomains are used to push the real domain out of view in narrow address bars.', `The registrable domain is "${reg}".`, SRC_URL),
    );
  }

  // Brand impersonation: brand keyword in subdomain/path but registrable domain not owned by brand
  const regLabel = reg.split('.')[0] ?? '';
  for (const [brand, official] of Object.entries(BRAND_DOMAINS)) {
    const owned = official.some((d) => hostMatchesDomain(bareHost, d));
    if (owned) continue;
    const inSubdomain = subs.some((s) => s.includes(brand));
    const inRegLabel = regLabel.includes(brand) && regLabel !== brand;
    if (inSubdomain || inRegLabel) {
      findings.push(
        finding(`url-brand-${brand}`, `Uses the name "${brand}" on a domain it does not appear to own`, 'high', `${host} (registrable domain: ${reg})`,
          `"${brand}" appears in the hostname, but the site is not on ${official.join(' / ')}. Brand names in unrelated domains are a common phishing pattern.`,
          `If you expected ${brand}, navigate to ${official[0]} directly.`, SRC_URL),
      );
      break;
    }
    // Typosquat: registrable label within edit distance 1-2 of brand (and same length-ish)
    if (regLabel.length >= 5 && Math.abs(regLabel.length - brand.length) <= 2) {
      const d = levenshtein(regLabel, brand);
      if (d > 0 && d <= (brand.length >= 8 ? 2 : 1)) {
        findings.push(
          finding(`url-typosquat-${brand}`, `Domain closely resembles "${brand}"`, 'high', `${reg} vs ${official[0]} (edit distance ${d})`,
            'The domain differs from a well-known brand by only a character or two, a technique known as typosquatting.',
            `Confirm the spelling; the official domain is ${official[0]}.`, SRC_URL),
        );
        break;
      }
    }
  }

  // Credential keywords on non-brand hosts
  if (CREDENTIAL_KEYWORDS.test(subs.join('.')) || CREDENTIAL_KEYWORDS.test(regLabel)) {
    findings.push(
      finding('url-cred-keywords', 'Hostname contains account/security keywords', 'low', truncate(host),
        'Words like "login", "verify" or "secure" in a hostname are common in phishing, though also used legitimately.', undefined, SRC_URL),
    );
  }

  // Hyphen-heavy registrable label
  if ((regLabel.match(/-/g) ?? []).length >= 3) {
    findings.push(finding('url-hyphens', 'Domain name contains many hyphens', 'low', reg, 'Heavily hyphenated domains are frequently generated for throwaway phishing sites.', undefined, SRC_URL));
  }

  // TLD
  const t = tld(bareHost);
  if (HIGH_ABUSE_TLDS.has(t)) {
    findings.push(finding('url-tld', `Top-level domain ".${t}" has elevated abuse rates`, 'low', `.${t}`, 'This TLD is cheap or free to register and appears frequently in abuse reports. Many legitimate sites use it too.', undefined, SRC_URL));
  }

  // Free hosting / shorteners
  const freeHost = FREE_HOSTING_SUFFIXES.find((s) => hostMatchesDomain(bareHost, s));
  if (freeHost && bareHost !== freeHost) {
    findings.push(
      finding('url-free-hosting', 'Hosted on a shared publishing platform', 'info', `${host} (platform: ${freeHost})`,
        'Anyone can publish under this platform\'s domain. The platform\'s reputation says nothing about this particular page.', 'Judge the page by its owner, not the platform domain.', SRC_URL),
    );
  }
  if (URL_SHORTENERS.has(bareHost)) {
    findings.push(finding('url-shortener', 'URL shortener', 'low', bareHost, 'Shortened links hide their final destination until followed.', 'Check the destination after the redirect.', SRC_URL));
  }

  // Port
  if (url.port && !['80', '443'].includes(url.port)) {
    findings.push(finding('url-port', 'Non-standard port', 'low', `:${url.port}`, 'Public websites normally use the default ports. Non-standard ports are common on development servers and occasionally on malicious hosts.', undefined, SRC_URL));
  }

  // Length & encoding
  if (rawUrl.length > 300) {
    findings.push(finding('url-length', 'Very long URL', 'info', `${rawUrl.length} characters`, 'Very long URLs can hide the important parts of the address.', undefined, SRC_URL));
  }
  if (/%25[0-9a-f]{2}/i.test(url.href)) {
    findings.push(finding('url-double-encoding', 'Double-encoded characters in URL', 'moderate', truncate((url.href.match(/%25[0-9a-f]{2}/i) ?? [''])[0]), 'Double percent-encoding is used to slip content past filters.', undefined, SRC_URL));
  }

  // Embedded redirect parameters
  for (const [key, value] of url.searchParams) {
    if (!REDIRECT_PARAMS.test(key)) continue;
    let target: URL | null = null;
    try {
      target = new URL(value);
    } catch {
      try {
        target = value.startsWith('//') ? new URL('https:' + value) : null;
      } catch {
        target = null;
      }
    }
    if (target && /^https?:$/.test(target.protocol) && registrableDomain(target.hostname) !== reg) {
      findings.push(
        finding('url-open-redirect', 'URL carries an off-site redirect target', 'moderate', `${key}=${truncate(target.origin, 80)}`,
          'A parameter tells this site to forward you to a different domain. Open redirects on trusted domains are abused to make malicious links look legitimate.',
          `Be aware you may end up on ${target.hostname}.`, SRC_URL),
      );
      break;
    }
  }

  return { findings, hostname: bareHost, unicodeHostname: unicodeHost, registrableDomain: reg };
}

const IMPORTANT_HEADERS: { name: string; title: string; severity: Severity; explanation: string }[] = [
  {
    name: 'strict-transport-security',
    title: 'No HSTS header',
    severity: 'low',
    explanation: 'Without Strict-Transport-Security, a first visit over HTTP can be intercepted before redirecting to HTTPS.',
  },
  {
    name: 'content-security-policy',
    title: 'No Content-Security-Policy header',
    severity: 'info',
    explanation: 'A CSP limits where scripts can load from and reduces the impact of cross-site scripting. Its absence is common and not itself a sign of malice.',
  },
  {
    name: 'x-content-type-options',
    title: 'No X-Content-Type-Options header',
    severity: 'info',
    explanation: 'Without "nosniff", browsers may guess content types, which can enable some injection attacks.',
  },
];

/** Page-level checks that need the content-script snapshot. */
export function analyzePageSecurity(snapshot: PageSnapshot): Finding[] {
  const findings: Finding[] = [];
  let page: URL;
  try {
    page = new URL(snapshot.url);
  } catch {
    return findings;
  }
  const https = page.protocol === 'https:';
  const pageReg = registrableDomain(page.hostname);

  if (https && snapshot.mixedContent.length > 0) {
    const sample = snapshot.mixedContent.slice(0, 3).map((m) => `<${m.tag}> ${truncate(m.url, 80)}`).join('\n');
    const active = snapshot.mixedContent.some((m) => ['script', 'iframe', 'link', 'object', 'embed'].includes(m.tag));
    findings.push(
      finding('page-mixed-content', active ? 'Insecure (HTTP) active content on an HTTPS page' : 'Insecure (HTTP) resources on an HTTPS page', active ? 'moderate' : 'low',
        `${snapshot.mixedContent.length} reference(s):\n${sample}`,
        'Parts of this page reference unencrypted URLs. Browsers block or upgrade most of these, but it indicates weak security hygiene.', undefined, SRC_PAGE),
    );
  }

  const pwForms = snapshot.forms.filter((f) => f.hasPassword);
  if (!https && snapshot.passwordFieldCount > 0 && !isPrivateOrReservedIP(page.hostname) && page.hostname !== 'localhost') {
    findings.push(
      finding('page-password-http', 'Password field on an unencrypted page', 'high', `${snapshot.passwordFieldCount} password field(s) on ${page.origin}`,
        'Anything typed into this form can be intercepted on the network.', 'Do not enter a password on this page.', SRC_PAGE),
    );
  }
  for (const f of pwForms) {
    let action: URL;
    try {
      action = new URL(f.action);
    } catch {
      continue;
    }
    if (action.protocol === 'http:' && https) {
      findings.push(finding('page-form-insecure-action', 'Password form submits over HTTP', 'high', `action="${truncate(f.action, 100)}"`, 'The login form sends credentials to an unencrypted address.', 'Do not submit this form.', SRC_PAGE));
      break;
    }
    if (/^https?:$/.test(action.protocol) && registrableDomain(action.hostname) !== pageReg) {
      findings.push(
        finding('page-form-crossdomain', 'Password form submits to a different domain', 'high', `${pageReg} → ${action.hostname}`,
          'Credentials entered here are sent to another site. This happens with legitimate single sign-on, but is also a hallmark of credential phishing.',
          `Only continue if you trust ${action.hostname}.`, SRC_PAGE),
      );
      break;
    }
  }

  if (snapshot.headerProbe.status === 'ok' && https) {
    for (const h of IMPORTANT_HEADERS) {
      if (!(h.name in snapshot.headerProbe.headers)) {
        findings.push(finding(`hdr-missing-${h.name}`, h.title, h.severity, `Response for ${page.origin}${page.pathname} has no ${h.name} header`, h.explanation, undefined, SRC_HEADERS));
      }
    }
  }

  return findings;
}

const SEVERITY_RANK: Record<Severity, number> = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };

/**
 * Converts findings to a risk category with explicit, documented rules:
 *  - any critical                         -> critical
 *  - 3+ high, or a reputation "malicious" -> critical
 *  - any high                             -> high
 *  - any moderate                         -> moderate
 *  - otherwise                            -> low
 * Returns 'unknown' when no analysis actually ran.
 */
export function aggregateRisk(findings: Finding[], analysisRan: boolean): RiskLevel {
  if (!analysisRan) return 'unknown';
  const counts = { info: 0, low: 0, moderate: 0, high: 0, critical: 0 };
  for (const f of findings) counts[f.severity]++;
  if (counts.critical > 0 || counts.high >= 3) return 'critical';
  if (counts.high > 0) return 'high';
  if (counts.moderate > 0) return 'moderate';
  return 'low';
}

export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
}

/** Reset helper for deterministic tests. */
export function _resetFindingSeq() {
  findingSeq = 0;
}
