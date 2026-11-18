import type { ReputationResult, ReputationVerdict } from '@ntm/shared';
import { reputationResultSchema } from '@ntm/shared';
import type { ReputationProvider } from '../providers';
import { PROVIDER_TIMEOUT_MS } from '../providers';
import type { KVLike } from '../types/env';
import { logEvent } from '../utils/log';

const CACHE_PREFIX = 'rep:v1:';
export const CLEAN_TTL_SECONDS = 6 * 60 * 60;
export const FLAGGED_TTL_SECONDS = 60 * 60;

async function runWithTimeout(
  provider: ReputationProvider,
  hostname: string,
  timeoutMs: number,
): Promise<ReputationVerdict> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('provider timeout'));
    }, timeoutMs);
  });
  try {
    return await Promise.race([provider.check(hostname, controller.signal), timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export interface ReputationServiceOptions {
  providers: ReputationProvider[];
  cache?: KVLike;
  timeoutMs?: number;
}

/**
 * Queries every configured provider in parallel. A provider failure is reported
 * as an 'unknown' verdict with the failure reason — it is never converted into
 * a 'clean' result. If every provider fails, status is 'unavailable'.
 */
export async function lookupReputation(
  hostname: string,
  { providers, cache, timeoutMs = PROVIDER_TIMEOUT_MS }: ReputationServiceOptions,
): Promise<ReputationResult> {
  if (providers.length === 0) {
    return {
      status: 'not-configured',
      hostname,
      verdicts: [],
      cached: false,
      message: 'No reputation providers are configured on this backend',
    };
  }

  const cacheKey = CACHE_PREFIX + [...providers.map((p) => p.id)].sort().join('+') + ':' + hostname;
  if (cache) {
    try {
      const hit = reputationResultSchema.safeParse(await cache.get(cacheKey, 'json'));
      if (hit.success) return { ...hit.data, cached: true };
    } catch (err) {
      logEvent('cache_read_error', { message: String(err) });
    }
  }

  const settled = await Promise.allSettled(providers.map((p) => runWithTimeout(p, hostname, timeoutMs)));
  const verdicts: ReputationVerdict[] = [];
  let failures = 0;
  settled.forEach((r, i) => {
    const provider = providers[i]!;
    if (r.status === 'fulfilled') {
      verdicts.push(r.value);
    } else {
      failures++;
      const reason = r.reason instanceof Error ? r.reason.message : 'provider error';
      logEvent('provider_error', { provider: provider.id, message: reason });
      verdicts.push({
        provider: provider.id,
        verdict: 'unknown',
        categories: [],
        detail: reason.includes('timeout') ? 'Provider timed out' : 'Provider request failed',
        checkedAt: Date.now(),
      });
    }
  });

  if (failures === providers.length) {
    return {
      status: 'unavailable',
      hostname,
      verdicts,
      cached: false,
      message: 'All reputation providers failed; no reputation verdict is available',
    };
  }

  const result: ReputationResult = {
    status: 'ok',
    hostname,
    verdicts,
    cached: false,
    ...(failures > 0 ? { message: `${failures} of ${providers.length} providers failed` } : {}),
  };

  // Only cache complete results so a transient provider failure is not pinned.
  if (cache && failures === 0) {
    const allClean = verdicts.every((v) => v.verdict === 'clean');
    try {
      await cache.put(cacheKey, JSON.stringify(result), {
        expirationTtl: allClean ? CLEAN_TTL_SECONDS : FLAGGED_TTL_SECONDS,
      });
    } catch (err) {
      logEvent('cache_write_error', { message: String(err) });
    }
  }
  return result;
}
