import { Hono } from 'hono';
import type { Context } from 'hono';
import { API_VERSION, analyzeRequestSchema } from '@ntm/shared';
import type { AppBindings, Env } from './types/env';
import { ApiError, errorResponse } from './utils/errors';
import { logEvent } from './utils/log';
import {
  MAX_ADMIN_BODY_BYTES,
  MAX_BODY_BYTES,
  bodyLimit,
  cors,
  rateLimit,
  requestId,
  securityHeaders,
} from './middleware';
import { createProviders } from './providers';
import type { ReputationProvider } from './providers';
import { lookupReputation } from './services/reputation';
import { publishBundle, resolveBundle } from './services/signatures';
import { D1SignatureRepository, pingDatabase } from './database/signatures-repo';
import type { SignatureKind, SignatureRepository } from './database/signatures-repo';
import { hostnameFromUrl, validatePublicHostname } from './security/hostname';
import { timingSafeEqualStr } from './security/crypto';

export const SERVICE_NAME = 'ntm-sentinel-api';

/** Dependency hooks so tests can inject fakes without touching module state. */
export interface AppDeps {
  signatureRepo?: (env: Env) => SignatureRepository | null;
  providers?: (env: Env) => ReputationProvider[];
  providerTimeoutMs?: number;
}

async function readJson(c: Context<AppBindings>): Promise<unknown> {
  const type = c.req.header('Content-Type') ?? '';
  if (!type.toLowerCase().startsWith('application/json')) {
    throw new ApiError(415, 'unsupported_media_type', 'Content-Type must be application/json');
  }
  const text = await c.req.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, 'invalid_json', 'Request body is not valid JSON');
  }
}

function parseKind(raw: string): SignatureKind {
  if (raw === 'technologies' || raw === 'trackers') return raw;
  throw new ApiError(404, 'not_found', 'Unknown signature kind');
}

export function createApp(deps: AppDeps = {}) {
  const getRepo = deps.signatureRepo ?? ((env: Env) => (env.DB ? new D1SignatureRepository(env.DB) : null));
  const getProviders = deps.providers ?? ((env: Env) => createProviders(env));

  const app = new Hono<AppBindings>();
  const api = new Hono<AppBindings>();

  app.use('*', requestId, securityHeaders, cors, rateLimit);
  api.use('/admin/*', bodyLimit(MAX_ADMIN_BODY_BYTES));
  api.use('*', async (c, next) => (c.req.path.includes('/admin/') ? next() : bodyLimit(MAX_BODY_BYTES)(c, next)));

  /* ------------------------------- Health ------------------------------- */
  api.get('/health', async (c) => {
    const checks: Record<string, 'ok' | 'error' | 'not-configured'> = {};
    checks.database = c.env.DB ? ((await pingDatabase(c.env.DB)) ? 'ok' : 'error') : 'not-configured';
    if (c.env.CACHE) {
      try {
        await c.env.CACHE.get('health:probe');
        checks.cache = 'ok';
      } catch {
        checks.cache = 'error';
      }
    } else {
      checks.cache = 'not-configured';
    }
    checks.reputation = getProviders(c.env).length > 0 ? 'ok' : 'not-configured';
    const degraded = Object.values(checks).includes('error');
    return c.json(
      { status: degraded ? 'degraded' : 'ok', version: API_VERSION, time: new Date().toISOString(), checks },
      degraded ? 503 : 200,
    );
  });

  /* ------------------------------- Version ------------------------------ */
  api.get('/version', async (c) => {
    const repo = getRepo(c.env);
    const [tech, trackers] = await Promise.all([resolveBundle('technologies', repo), resolveBundle('trackers', repo)]);
    return c.json({
      api: API_VERSION,
      service: SERVICE_NAME,
      build: c.env.BUILD_ID ?? 'dev',
      signatures: { technologies: tech.version, trackers: trackers.version },
    });
  });

  /* ------------------------------ Security ------------------------------ */
  const reputationFor = (c: Context<AppBindings>, hostname: string) =>
    lookupReputation(hostname, {
      providers: getProviders(c.env),
      ...(c.env.CACHE ? { cache: c.env.CACHE } : {}),
      ...(deps.providerTimeoutMs ? { timeoutMs: deps.providerTimeoutMs } : {}),
    });

  api.post('/security/analyze', async (c) => {
    const body = await readJson(c);
    const parsed = analyzeRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(422, 'validation_failed', parsed.error.issues[0]?.message ?? 'Invalid request');
    }
    const target = parsed.data.url ? hostnameFromUrl(parsed.data.url) : validatePublicHostname(parsed.data.hostname!);
    if (!target.ok) throw new ApiError(422, 'validation_failed', target.reason);
    const result = await reputationFor(c, target.hostname);
    logEvent('reputation_lookup', { status: result.status, cached: result.cached });
    return c.json(result);
  });

  api.get('/security/reputation/:hostname', async (c) => {
    const target = validatePublicHostname(decodeURIComponent(c.req.param('hostname')));
    if (!target.ok) throw new ApiError(422, 'validation_failed', target.reason);
    const result = await reputationFor(c, target.hostname);
    logEvent('reputation_lookup', { status: result.status, cached: result.cached });
    return c.json(result);
  });

  /* ----------------------------- Signatures ----------------------------- */
  api.get('/signatures/:kind', async (c) => {
    const kind = parseKind(c.req.param('kind'));
    const bundle = await resolveBundle(kind, getRepo(c.env));
    c.header('ETag', bundle.etag);
    c.header('Cache-Control', 'public, max-age=3600');
    c.header('X-Signature-Source', bundle.source);
    const inm = c.req.header('If-None-Match');
    if (inm && inm.split(',').map((s) => s.trim()).includes(bundle.etag)) {
      return c.body(null, 304);
    }
    c.header('Content-Type', 'application/json; charset=utf-8');
    return c.body(bundle.json);
  });

  /* ------------------------------- Admin -------------------------------- */
  api.put('/admin/signatures/:kind', async (c) => {
    const token = c.env.ADMIN_TOKEN;
    if (!token || token.length < 32) {
      // Admin publishing is disabled unless a strong token is configured.
      throw new ApiError(403, 'forbidden', 'Signature publishing is disabled on this deployment');
    }
    const auth = c.req.header('Authorization') ?? '';
    const match = /^Bearer\s+(.+)$/i.exec(auth);
    if (!match) throw new ApiError(401, 'unauthorized', 'Missing bearer token');
    if (!(await timingSafeEqualStr(match[1]!.trim(), token))) {
      throw new ApiError(403, 'forbidden', 'Invalid credentials');
    }
    const kind = parseKind(c.req.param('kind'));
    const repo = getRepo(c.env);
    if (!repo) throw new ApiError(503, 'service_unavailable', 'Database is not configured');
    const body = await readJson(c);
    const result = await publishBundle(kind, body, repo, c.env.CACHE);
    if (!result.ok) {
      return c.json(
        { error: { code: 'validation_failed', message: result.issues.join('; '), requestId: c.get('requestId') } },
        422,
      );
    }
    logEvent('signatures_published', { kind, version: result.version });
    return c.json({ ok: true, kind, version: result.version }, 201);
  });

  app.route(`/api/${API_VERSION}`, api);

  app.notFound((c) => errorResponse(c, 404, 'not_found', 'Route not found'));
  app.onError((err, c) => {
    if (err instanceof ApiError) return errorResponse(c, err.status, err.code, err.message);
    logEvent('unhandled_error', { message: err instanceof Error ? err.message : String(err), path: c.req.path });
    return errorResponse(c, 500, 'internal_error', 'Internal server error');
  });

  return app;
}
