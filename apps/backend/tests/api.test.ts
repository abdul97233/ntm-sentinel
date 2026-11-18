import { describe, expect, it } from 'vitest';
import { healthResponseSchema, reputationResultSchema, versionResponseSchema } from '@ntm/shared';
import { technologySignatures } from '@ntm/signatures';
import { ADMIN_TOKEN, CountingLimiter, EXT_ORIGIN, setup } from './helpers';

describe('health & version', () => {
  it('GET /health returns a valid health document', async () => {
    const { call } = setup();
    const res = await call('/api/v1/health');
    expect(res.status).toBe(200);
    const body = healthResponseSchema.parse(await res.json());
    expect(body.status).toBe('ok');
    expect(body.checks.cache).toBe('ok');
    expect(body.checks.database).toBe('not-configured');
    expect(res.headers.get('X-Request-Id')).toBeTruthy();
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('GET /version reports signature versions', async () => {
    const { call } = setup();
    const body = versionResponseSchema.parse(await (await call('/api/v1/version')).json());
    expect(body.api).toBe('v1');
    expect(body.signatures.technologies).toBe(technologySignatures.version);
  });

  it('unknown routes return structured 404', async () => {
    const { call } = setup();
    const res = await call('/api/v1/nope');
    expect(res.status).toBe(404);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe('not_found');
    expect(body.error.requestId).toBeTruthy();
  });
});

describe('CORS', () => {
  it('allows the configured extension origin', async () => {
    const { call } = setup();
    const res = await call('/api/v1/health', { headers: { Origin: EXT_ORIGIN } });
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(EXT_ORIGIN);
  });

  it('answers preflight for allowed origin', async () => {
    const { call } = setup();
    const res = await call('/api/v1/security/analyze', {
      method: 'OPTIONS',
      headers: { Origin: EXT_ORIGIN, 'Access-Control-Request-Method': 'POST' },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });

  it('rejects unknown web origins with 403', async () => {
    const { call } = setup();
    const res = await call('/api/v1/health', { headers: { Origin: 'https://evil.example.com' } });
    expect(res.status).toBe(403);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(((await res.json()) as any).error.code).toBe('origin_not_allowed');
  });

  it('rejects other extension ids in non-development environments', async () => {
    const { call } = setup();
    const res = await call('/api/v1/health', {
      headers: { Origin: 'chrome-extension://ponmlkjihgfedcbaponmlkjihgfedcba' },
    });
    expect(res.status).toBe(403);
  });

  it('accepts any unpacked extension id and localhost in development', async () => {
    const { call } = setup({ env: { ENVIRONMENT: 'development', ALLOWED_ORIGINS: '' } });
    for (const origin of ['extension://ponmlkjihgfedcbaponmlkjihgfedcba', 'http://localhost:5173']) {
      expect((await call('/api/v1/health', { headers: { Origin: origin } })).status).toBe(200);
    }
  });
});

describe('POST /security/analyze — validation & SSRF', () => {
  const rejected: [string, unknown][] = [
    ['localhost url', { url: 'http://localhost/admin' }],
    ['loopback ip', { url: 'http://127.0.0.1:8080/' }],
    ['metadata ip', { url: 'http://169.254.169.254/latest/meta-data' }],
    ['ipv6 loopback', { url: 'http://[::1]/' }],
    ['decimal ip', { url: 'http://2130706433/' }],
    ['hex ip', { url: 'http://0x7f000001/' }],
    ['file scheme', { url: 'file:///etc/passwd' }],
    ['javascript scheme', { url: 'javascript:alert(1)' }],
    ['data scheme', { url: 'data:text/html,hi' }],
    ['garbage url', { url: 'not a url' }],
    ['single label host', { hostname: 'intranet' }],
    ['internal suffix', { hostname: 'db.internal' }],
    ['invalid chars', { hostname: 'exa mple.com' }],
    ['ip as hostname', { hostname: '10.0.0.1' }],
    ['empty body object', {}],
    ['unexpected field', { hostname: 'example.org', fetch: 'http://x' }],
  ];

  for (const [name, body] of rejected) {
    it(`rejects ${name}`, async () => {
      const { postJson } = setup();
      const res = await postJson('/api/v1/security/analyze', body);
      expect(res.status).toBe(422);
      expect(((await res.json()) as any).error.code).toBe('validation_failed');
    });
  }

  it('rejects malformed JSON with 400', async () => {
    const { postJson } = setup();
    const res = await postJson('/api/v1/security/analyze', '{"url": ');
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).error.code).toBe('invalid_json');
  });

  it('rejects non-JSON content type with 415', async () => {
    const { call } = setup();
    const res = await call('/api/v1/security/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'hostname=example.org',
    });
    expect(res.status).toBe(415);
  });

  it('rejects oversized bodies with 413', async () => {
    const { postJson } = setup();
    const res = await postJson('/api/v1/security/analyze', { url: 'https://example.org/?' + 'a'.repeat(20_000) });
    expect(res.status).toBe(413);
  });

  it('accepts a public URL and returns a reputation result', async () => {
    const { postJson } = setup();
    const res = await postJson('/api/v1/security/analyze', { url: 'https://www.malicious-test.com/login?x=1' });
    expect(res.status).toBe(200);
    const body = reputationResultSchema.parse(await res.json());
    expect(body.hostname).toBe('www.malicious-test.com');
    expect(body.status).toBe('ok');
    expect(body.verdicts[0]!.verdict).toBe('malicious');
  });
});

describe('GET /security/reputation/:hostname', () => {
  it('returns mock verdicts deterministically', async () => {
    const { call } = setup();
    const sus = reputationResultSchema.parse(await (await call('/api/v1/security/reputation/a.suspicious-test.net')).json());
    expect(sus.verdicts[0]!.verdict).toBe('suspicious');
    const clean = reputationResultSchema.parse(await (await call('/api/v1/security/reputation/example.org')).json());
    expect(clean.verdicts[0]!.verdict).toBe('clean');
  });

  it('marks the second lookup as cached', async () => {
    const { call, kv } = setup();
    const first = (await (await call('/api/v1/security/reputation/example.org')).json()) as any;
    const second = (await (await call('/api/v1/security/reputation/example.org')).json()) as any;
    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(kv.puts[0]!.ttl).toBe(6 * 60 * 60);
  });

  it('rejects private hosts', async () => {
    const { call } = setup();
    expect((await call('/api/v1/security/reputation/localhost')).status).toBe(422);
    expect((await call('/api/v1/security/reputation/127.0.0.1')).status).toBe(422);
  });

  it('reports not-configured when no providers exist', async () => {
    const { call } = setup({ deps: { providers: () => [] } });
    const body = reputationResultSchema.parse(await (await call('/api/v1/security/reputation/example.org')).json());
    expect(body.status).toBe('not-configured');
    expect(body.verdicts).toHaveLength(0);
  });
});

describe('rate limiting', () => {
  it('returns 429 once the limiter denies', async () => {
    const { call } = setup({ env: { RATE_LIMITER: new CountingLimiter(2) } });
    expect((await call('/api/v1/health')).status).toBe(200);
    expect((await call('/api/v1/health')).status).toBe(200);
    const res = await call('/api/v1/health');
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('60');
    expect(((await res.json()) as any).error.code).toBe('rate_limited');
  });

  it('falls back to the in-memory limiter when the binding is absent', async () => {
    const { call } = setup({ env: { RATE_LIMITER: undefined } });
    const statuses: number[] = [];
    for (let i = 0; i < 62; i++) {
      statuses.push((await call('/api/v1/health', { headers: { 'CF-Connecting-IP': '203.0.113.77' } })).status);
    }
    expect(statuses.filter((s) => s === 429).length).toBeGreaterThan(0);
  });
});

describe('signatures', () => {
  it('serves the bundled technology signatures with an ETag', async () => {
    const { call } = setup();
    const res = await call('/api/v1/signatures/technologies');
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Signature-Source')).toBe('bundled');
    const etag = res.headers.get('ETag');
    expect(etag).toMatch(/^"technologies-[0-9a-f]{24}"$/);
    const body = (await res.json()) as any;
    expect(body.version).toBe(technologySignatures.version);
  });

  it('returns 304 for a matching If-None-Match', async () => {
    const { call } = setup();
    const etag = (await call('/api/v1/signatures/trackers')).headers.get('ETag')!;
    const res = await call('/api/v1/signatures/trackers', { headers: { 'If-None-Match': etag } });
    expect(res.status).toBe(304);
  });

  it('404s unknown kinds', async () => {
    const { call } = setup();
    expect((await call('/api/v1/signatures/passwords')).status).toBe(404);
  });
});

describe('admin signature publishing', () => {
  const newBundle = {
    schemaVersion: 1,
    version: '2099.01.01',
    signatures: [
      { id: 'test-tech', name: 'Test Tech', category: 'other', rules: [{ type: 'global', path: 'TestTech', weight: 100 }] },
    ],
  };
  const put = (call: ReturnType<typeof setup>['call'], body: unknown, token?: string) =>
    call('/api/v1/admin/signatures/technologies', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });

  it('requires a bearer token (401)', async () => {
    const { call } = setup();
    expect((await put(call, newBundle)).status).toBe(401);
  });

  it('rejects a wrong token (403)', async () => {
    const { call } = setup();
    expect((await put(call, newBundle, 'b'.repeat(40))).status).toBe(403);
  });

  it('is disabled when ADMIN_TOKEN is missing or weak', async () => {
    const { call } = setup({ env: { ADMIN_TOKEN: 'short' } });
    expect((await put(call, newBundle, 'short')).status).toBe(403);
  });

  it('rejects invalid bundles with 422', async () => {
    const { call } = setup();
    const bad = { ...newBundle, signatures: [{ id: 'BAD ID', name: '', category: 'nope', rules: [] }] };
    const res = await put(call, bad, ADMIN_TOKEN);
    expect(res.status).toBe(422);
  });

  it('rejects ReDoS-prone patterns', async () => {
    const { call } = setup();
    const bad = {
      ...newBundle,
      signatures: [{ id: 'redos', name: 'x', category: 'other', rules: [{ type: 'scriptSrc', pattern: '(a+)+$', weight: 50 }] }],
    };
    expect((await put(call, bad, ADMIN_TOKEN)).status).toBe(422);
  });

  it('publishes a valid bundle, which is then served from the database', async () => {
    const { call, kv } = setup();
    const res = await put(call, newBundle, ADMIN_TOKEN);
    expect(res.status).toBe(201);
    expect(kv.store.get('sigver:technologies')).toContain('2099.01.01');
    const served = await call('/api/v1/signatures/technologies');
    expect(served.headers.get('X-Signature-Source')).toBe('database');
    expect(((await served.json()) as any).version).toBe('2099.01.01');
    const version = (await (await call('/api/v1/version')).json()) as any;
    expect(version.signatures.technologies).toBe('2099.01.01');
  });
});
