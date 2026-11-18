import type { ReputationVerdict } from '@ntm/shared';
import type { Env } from '../types/env';

/**
 * Threat-intelligence provider adapter. Implementations MUST only contact their
 * own fixed, trusted endpoint; the hostname is passed as data, never as a URL to fetch.
 */
export interface ReputationProvider {
  readonly id: string;
  check(hostname: string, signal: AbortSignal): Promise<ReputationVerdict>;
}

export type FetchFn = typeof fetch;

export const PROVIDER_TIMEOUT_MS = 4000;

/* ------------------------------- Mock -------------------------------- */

/** Deterministic provider for local development and tests. Never use in production. */
export class MockProvider implements ReputationProvider {
  readonly id = 'mock';
  async check(hostname: string): Promise<ReputationVerdict> {
    const checkedAt = Date.now();
    if (hostname.includes('malicious-test')) {
      return { provider: this.id, verdict: 'malicious', categories: ['phishing'], detail: 'Mock provider test domain', checkedAt };
    }
    if (hostname.includes('suspicious-test')) {
      return { provider: this.id, verdict: 'suspicious', categories: ['suspicious'], detail: 'Mock provider test domain', checkedAt };
    }
    return { provider: this.id, verdict: 'clean', categories: [], detail: 'No mock threat record', checkedAt };
  }
}

/* ------------------------- Google Safe Browsing ------------------------ */

const GSB_ENDPOINT = 'https://safebrowsing.googleapis.com/v4/threatMatches:find';

/**
 * Google Safe Browsing Lookup API v4 (threatMatches:find). Subject to Google's
 * Safe Browsing terms: non-commercial use; commercial deployments should use Web Risk.
 */
export class GoogleSafeBrowsingProvider implements ReputationProvider {
  readonly id = 'google-safe-browsing';
  constructor(
    private readonly apiKey: string,
    private readonly fetchFn: FetchFn = fetch,
  ) {}

  async check(hostname: string, signal: AbortSignal): Promise<ReputationVerdict> {
    const body = {
      client: { clientId: 'ntm-sentinel', clientVersion: '0.1.0' },
      threatInfo: {
        threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE', 'POTENTIALLY_HARMFUL_APPLICATION'],
        platformTypes: ['ANY_PLATFORM'],
        threatEntryTypes: ['URL'],
        threatEntries: [{ url: `http://${hostname}/` }, { url: `https://${hostname}/` }],
      },
    };
    const res = await this.fetchFn(`${GSB_ENDPOINT}?key=${encodeURIComponent(this.apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) throw new Error(`Safe Browsing responded ${res.status}`);
    const data = (await res.json()) as { matches?: { threatType?: string }[] };
    const matches = data.matches ?? [];
    const categories = Array.from(new Set(matches.map((m) => (m.threatType ?? 'UNKNOWN').toLowerCase())));
    return {
      provider: this.id,
      verdict: matches.length > 0 ? 'malicious' : 'clean',
      categories,
      detail: matches.length > 0 ? `${matches.length} threat match(es)` : 'Not on Safe Browsing lists',
      checkedAt: Date.now(),
    };
  }
}

/* ------------------------------ VirusTotal ----------------------------- */

const VT_ENDPOINT = 'https://www.virustotal.com/api/v3/domains/';

/** VirusTotal v3 domain report. Public API keys are rate limited and non-commercial. */
export class VirusTotalProvider implements ReputationProvider {
  readonly id = 'virustotal';
  constructor(
    private readonly apiKey: string,
    private readonly fetchFn: FetchFn = fetch,
  ) {}

  async check(hostname: string, signal: AbortSignal): Promise<ReputationVerdict> {
    const res = await this.fetchFn(VT_ENDPOINT + encodeURIComponent(hostname), {
      headers: { 'x-apikey': this.apiKey, Accept: 'application/json' },
      signal,
    });
    if (res.status === 404) {
      return { provider: this.id, verdict: 'unknown', categories: [], detail: 'Domain not known to VirusTotal', checkedAt: Date.now() };
    }
    if (!res.ok) throw new Error(`VirusTotal responded ${res.status}`);
    const data = (await res.json()) as {
      data?: { attributes?: { last_analysis_stats?: Record<string, number>; categories?: Record<string, string> } };
    };
    const stats = data.data?.attributes?.last_analysis_stats ?? {};
    const malicious = stats.malicious ?? 0;
    const suspicious = stats.suspicious ?? 0;
    const categories = Array.from(new Set(Object.values(data.data?.attributes?.categories ?? {}))).slice(0, 8);
    const verdict: ReputationVerdict['verdict'] =
      malicious >= 2 ? 'malicious' : malicious === 1 || suspicious > 0 ? 'suspicious' : Object.keys(stats).length ? 'clean' : 'unknown';
    return {
      provider: this.id,
      verdict,
      categories,
      detail: `${malicious} malicious / ${suspicious} suspicious engine verdicts`,
      checkedAt: Date.now(),
    };
  }
}

/* ------------------------------- Registry ------------------------------ */

/** Builds the provider list from REPUTATION_PROVIDERS; providers missing a key are skipped. */
export function createProviders(env: Env, fetchFn: FetchFn = fetch): ReputationProvider[] {
  const ids = (env.REPUTATION_PROVIDERS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const providers: ReputationProvider[] = [];
  for (const id of ids) {
    if (id === 'mock' && env.ENVIRONMENT !== 'production') providers.push(new MockProvider());
    else if (id === 'gsb' && env.GSB_API_KEY) providers.push(new GoogleSafeBrowsingProvider(env.GSB_API_KEY, fetchFn));
    else if (id === 'virustotal' && env.VT_API_KEY) providers.push(new VirusTotalProvider(env.VT_API_KEY, fetchFn));
  }
  return providers;
}
