import { techSignatureBundleSchema, trackerSignatureBundleSchema } from '@ntm/shared';
import { technologySignatures, trackerSignatures } from '@ntm/signatures';
import type { SignatureKind, SignatureRepository } from '../database/signatures-repo';
import type { KVLike } from '../types/env';
import { sha256Hex } from '../security/crypto';
import { logEvent } from '../utils/log';

export const SIGNATURE_VERSION_KEY = (kind: SignatureKind) => `sigver:${kind}`;

export interface ResolvedBundle {
  version: string;
  json: string;
  etag: string;
  source: 'database' | 'bundled';
}

const BUNDLED: Record<SignatureKind, { version: string; signatures?: unknown; trackers?: unknown }> = {
  technologies: technologySignatures,
  trackers: trackerSignatures,
};

export function schemaFor(kind: SignatureKind) {
  return kind === 'technologies' ? techSignatureBundleSchema : trackerSignatureBundleSchema;
}

async function etagFor(kind: SignatureKind, json: string): Promise<string> {
  return `"${kind}-${(await sha256Hex(json)).slice(0, 24)}"`;
}

/**
 * Returns the newest signature bundle. Database bundles are re-validated before
 * being served; an invalid or unreachable database falls back to the bundle
 * shipped with the Worker, so clients always receive a valid bundle.
 */
export async function resolveBundle(kind: SignatureKind, repo: SignatureRepository | null): Promise<ResolvedBundle> {
  if (repo) {
    try {
      const stored = await repo.latest(kind);
      if (stored) {
        const parsed = schemaFor(kind).safeParse(JSON.parse(stored.bundleJson));
        if (parsed.success) {
          const json = JSON.stringify(parsed.data);
          return { version: parsed.data.version, json, etag: await etagFor(kind, json), source: 'database' };
        }
        logEvent('stored_bundle_invalid', { kind, version: stored.version });
      }
    } catch (err) {
      logEvent('signature_repo_error', { kind, message: String(err) });
    }
  }
  const json = JSON.stringify(BUNDLED[kind]);
  return { version: BUNDLED[kind].version, json, etag: await etagFor(kind, json), source: 'bundled' };
}

export async function publishBundle(
  kind: SignatureKind,
  body: unknown,
  repo: SignatureRepository,
  cache: KVLike | undefined,
): Promise<{ ok: true; version: string } | { ok: false; issues: string[] }> {
  const parsed = schemaFor(kind).safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.slice(0, 20).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    };
  }
  await repo.save(kind, parsed.data.version, JSON.stringify(parsed.data));
  if (cache) {
    try {
      await cache.put(SIGNATURE_VERSION_KEY(kind), JSON.stringify({ version: parsed.data.version, publishedAt: Date.now() }));
    } catch (err) {
      logEvent('cache_write_error', { message: String(err) });
    }
  }
  return { ok: true, version: parsed.data.version };
}
