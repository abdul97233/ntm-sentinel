import { describe, expect, it } from 'vitest';
import {
  GoogleSafeBrowsingProvider,
  MockProvider,
  VirusTotalProvider,
  createProviders,
} from '../src/providers';
import type { ReputationProvider } from '../src/providers';
import { lookupReputation } from '../src/services/reputation';
import { FakeKV } from './helpers';

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('provider adapters', () => {
  it('Safe Browsing: only calls the fixed Google endpoint and maps matches', async () => {
    const calls: string[] = [];
    const fetchFn = (async (url: string, init: RequestInit) => {
      calls.push(url);
      const body = JSON.parse(String(init.body));
      expect(body.threatInfo.threatEntries).toEqual([{ url: 'http://bad.com/' }, { url: 'https://bad.com/' }]);
      return jsonResponse({ matches: [{ threatType: 'SOCIAL_ENGINEERING' }] });
    }) as unknown as typeof fetch;
    const v = await new GoogleSafeBrowsingProvider('k', fetchFn).check('bad.com', new AbortController().signal);
    expect(calls[0]).toMatch(/^https:\/\/safebrowsing\.googleapis\.com\/v4\/threatMatches:find\?key=k$/);
    expect(v.verdict).toBe('malicious');
    expect(v.categories).toEqual(['social_engineering']);
  });

  it('Safe Browsing: empty response is clean', async () => {
    const fetchFn = (async () => jsonResponse({})) as unknown as typeof fetch;
    const v = await new GoogleSafeBrowsingProvider('k', fetchFn).check('ok.com', new AbortController().signal);
    expect(v.verdict).toBe('clean');
  });

  it('VirusTotal: maps analysis stats and 404', async () => {
    const urls: string[] = [];
    const fetchFn = (async (url: string) => {
      urls.push(url);
      if (url.endsWith('unknown.com')) return new Response('', { status: 404 });
      return jsonResponse({ data: { attributes: { last_analysis_stats: { malicious: 3, suspicious: 0, harmless: 60 } } } });
    }) as unknown as typeof fetch;
    const p = new VirusTotalProvider('k', fetchFn);
    expect((await p.check('bad.com', new AbortController().signal)).verdict).toBe('malicious');
    expect((await p.check('unknown.com', new AbortController().signal)).verdict).toBe('unknown');
    expect(urls[0]).toBe('https://www.virustotal.com/api/v3/domains/bad.com');
  });

  it('createProviders skips providers without keys and mock in production', () => {
    expect(createProviders({ REPUTATION_PROVIDERS: 'gsb,virustotal' })).toHaveLength(0);
    expect(createProviders({ REPUTATION_PROVIDERS: 'mock', ENVIRONMENT: 'production' })).toHaveLength(0);
    expect(createProviders({ REPUTATION_PROVIDERS: 'mock,gsb', GSB_API_KEY: 'x' }).map((p) => p.id)).toEqual([
      'mock',
      'google-safe-browsing',
    ]);
  });
});

describe('reputation aggregation', () => {
  const hanging: ReputationProvider = {
    id: 'hanging',
    check: () => new Promise(() => {}),
  };
  const failing: ReputationProvider = {
    id: 'failing',
    check: async () => {
      throw new Error('boom');
    },
  };

  it('a timed-out provider yields "unavailable", never a fake clean verdict', async () => {
    const r = await lookupReputation('example.org', { providers: [hanging], timeoutMs: 30 });
    expect(r.status).toBe('unavailable');
    expect(r.verdicts[0]!.verdict).toBe('unknown');
    expect(r.verdicts[0]!.detail).toBe('Provider timed out');
  });

  it('partial failure keeps the good verdict, flags the failure and is not cached', async () => {
    const kv = new FakeKV();
    const r = await lookupReputation('example.org', { providers: [new MockProvider(), failing], cache: kv, timeoutMs: 50 });
    expect(r.status).toBe('ok');
    expect(r.message).toContain('1 of 2');
    expect(r.verdicts.map((v) => v.verdict)).toEqual(['clean', 'unknown']);
    expect(kv.puts).toHaveLength(0);
  });

  it('flagged results get the shorter cache TTL', async () => {
    const kv = new FakeKV();
    await lookupReputation('x.malicious-test.com', { providers: [new MockProvider()], cache: kv });
    expect(kv.puts[0]!.ttl).toBe(60 * 60);
  });
});
