/**
 * Optional NTM backend client. Only ever called when the user has enabled the
 * corresponding cloud feature. Every response is schema-validated; failures are
 * reported honestly (never turned into a fake "clean" result).
 */
import {
  reputationResultSchema,
  techSignatureBundleSchema,
  trackerSignatureBundleSchema,
  healthResponseSchema,
  type ReputationResult,
  type TechSignatureBundle,
  type TrackerSignatureBundle,
} from '@ntm/shared';

const API_URL: string = typeof __NTM_API_URL__ === 'string' ? __NTM_API_URL__ : '';
const TIMEOUT_MS = 8000;

export function apiConfigured(): boolean {
  return !!API_URL;
}
export function apiOrigin(): string {
  return API_URL;
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  if (!API_URL) throw new Error('Cloud backend is not configured in this build.');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(`${API_URL}/api/v1${path}`, {
      ...init,
      signal: ctrl.signal,
      credentials: 'omit',
      cache: 'no-store',
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    });
  } finally {
    clearTimeout(t);
  }
}

export async function checkHealth(): Promise<{ reachable: boolean; message?: string }> {
  try {
    const res = await request('/health');
    const parsed = healthResponseSchema.safeParse(await res.json());
    if (!res.ok || !parsed.success) return { reachable: false, message: `Unexpected response (${res.status})` };
    return { reachable: true, message: parsed.data.status === 'ok' ? undefined : 'Backend reports degraded service' };
  } catch (e) {
    return { reachable: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/** Sends ONLY the hostname (never the full URL, path or query) for a reputation lookup. */
export async function fetchReputation(hostname: string): Promise<ReputationResult> {
  try {
    const res = await request(`/security/reputation/${encodeURIComponent(hostname)}`);
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = (body as { error?: { message?: string } } | null)?.error?.message ?? `HTTP ${res.status}`;
      return { status: 'error', hostname, verdicts: [], cached: false, message: msg };
    }
    const parsed = reputationResultSchema.safeParse(body);
    if (!parsed.success) return { status: 'error', hostname, verdicts: [], cached: false, message: 'Invalid response from backend' };
    return parsed.data;
  } catch (e) {
    return {
      status: 'unavailable',
      hostname,
      verdicts: [],
      cached: false,
      message: `Cloud reputation service unreachable: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

export async function fetchSignatures(): Promise<{ tech?: TechSignatureBundle; trackers?: TrackerSignatureBundle; error?: string }> {
  try {
    const [t, k] = await Promise.all([request('/signatures/technologies'), request('/signatures/trackers')]);
    const tech = t.ok ? techSignatureBundleSchema.safeParse(await t.json()) : null;
    const trackers = k.ok ? trackerSignatureBundleSchema.safeParse(await k.json()) : null;
    return {
      tech: tech?.success ? tech.data : undefined,
      trackers: trackers?.success ? trackers.data : undefined,
      error: !tech?.success || !trackers?.success ? 'One or more signature bundles failed validation or could not be fetched' : undefined,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
