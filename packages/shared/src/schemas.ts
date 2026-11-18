/**
 * Zod schemas shared by the backend (input validation) and the extension
 * (validation of anything received from the network or from storage).
 */
import { z } from 'zod';

/* ----------------------------- Signatures ----------------------------- */

const MAX_PATTERN_LENGTH = 300;

/**
 * Rejects regex patterns that are likely to cause catastrophic backtracking
 * (nested quantifiers such as (a+)+ or (a*)*), or that are too long. Remote
 * signature updates are data, never code, but regexes still need ReDoS hygiene.
 */
export function isSafePattern(pattern: string): boolean {
  if (pattern.length > MAX_PATTERN_LENGTH) return false;
  if (/\([^)]*[+*][^)]*\)[+*{]/.test(pattern)) return false;
  try {
    new RegExp(pattern, 'i');
    return true;
  } catch {
    return false;
  }
}

export const safePattern = z.string().min(1).refine(isSafePattern, 'unsafe or invalid pattern');

export const techCategorySchema = z.enum([
  'frontend-framework',
  'meta-framework',
  'cms',
  'ecommerce',
  'js-library',
  'css-framework',
  'analytics',
  'tag-manager',
  'cdn',
  'hosting',
  'server',
  'security',
  'font',
  'other',
]);

/**
 * A single detection rule. All are evaluated locally against a PageSnapshot.
 * - global: a dotted property path on `window` (checked in the page's MAIN world, read-only)
 * - scriptSrc / resource: regex against script src URLs / any loaded resource URL
 * - meta: regex against the content of <meta name=...>
 * - selector: CSS selector that must match at least one element
 * - header: regex against a response header of the top document (from the same-origin header probe)
 * - cookie: regex against cookie *names* (values are never read)
 * - classPattern: regex against sampled class names
 */
export const detectionRuleSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('global'), path: z.string().regex(/^[A-Za-z_$][\w$]*(\.[\w$]+){0,4}$/), weight: z.number().min(0).max(100) }),
  z.object({ type: z.literal('scriptSrc'), pattern: safePattern, weight: z.number().min(0).max(100) }),
  z.object({ type: z.literal('resource'), pattern: safePattern, weight: z.number().min(0).max(100) }),
  z.object({ type: z.literal('meta'), name: z.string().max(80), pattern: safePattern, weight: z.number().min(0).max(100) }),
  z.object({ type: z.literal('selector'), selector: z.string().min(1).max(200), weight: z.number().min(0).max(100) }),
  z.object({ type: z.literal('header'), name: z.string().max(80), pattern: safePattern, weight: z.number().min(0).max(100) }),
  z.object({ type: z.literal('cookie'), pattern: safePattern, weight: z.number().min(0).max(100) }),
  z.object({ type: z.literal('classPattern'), pattern: safePattern, weight: z.number().min(0).max(100) }),
]);

/**
 * Version extraction: either a regex (first capture group) applied to a signal
 * source, or a global property path whose string value is the version.
 */
export const versionRuleSchema = z.discriminatedUnion('from', [
  z.object({ from: z.literal('global'), path: z.string().regex(/^[A-Za-z_$][\w$]*(\.[\w$]+){0,4}$/) }),
  z.object({ from: z.literal('scriptSrc'), pattern: safePattern }),
  z.object({ from: z.literal('meta'), name: z.string().max(80), pattern: safePattern }),
  z.object({ from: z.literal('header'), name: z.string().max(80), pattern: safePattern }),
  z.object({ from: z.literal('selectorAttr'), selector: z.string().max(200), attr: z.string().max(60), pattern: safePattern }),
]);

export const techSignatureSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,60}$/),
  name: z.string().min(1).max(80),
  category: techCategorySchema,
  website: z.string().url().optional(),
  rules: z.array(detectionRuleSchema).min(1).max(20),
  version: z.array(versionRuleSchema).max(5).optional(),
  /** IDs implied by this technology (e.g. next.js implies react). */
  implies: z.array(z.string()).max(10).optional(),
});

export const techSignatureBundleSchema = z.object({
  schemaVersion: z.literal(1),
  version: z.string().regex(/^\d{4}\.\d{2}\.\d{2}(\.\d+)?$/),
  signatures: z.array(techSignatureSchema).max(2000),
});

export const trackerCategorySchema = z.enum([
  'analytics',
  'advertising',
  'social',
  'tag-manager',
  'session-replay',
  'fingerprinting',
  'consent',
  'customer-engagement',
  'other',
]);

export const trackerSignatureSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,60}$/),
  name: z.string().min(1).max(80),
  company: z.string().max(80).optional(),
  category: trackerCategorySchema,
  /** Registrable domains or exact hostnames. Subdomains match automatically. */
  domains: z.array(z.string().regex(/^[a-z0-9.-]{3,253}$/)).min(1).max(50),
});

export const trackerSignatureBundleSchema = z.object({
  schemaVersion: z.literal(1),
  version: z.string().regex(/^\d{4}\.\d{2}\.\d{2}(\.\d+)?$/),
  trackers: z.array(trackerSignatureSchema).max(5000),
});

export type DetectionRule = z.infer<typeof detectionRuleSchema>;
export type VersionRule = z.infer<typeof versionRuleSchema>;
export type TechSignature = z.infer<typeof techSignatureSchema>;
export type TechSignatureBundle = z.infer<typeof techSignatureBundleSchema>;
export type TrackerSignature = z.infer<typeof trackerSignatureSchema>;
export type TrackerSignatureBundle = z.infer<typeof trackerSignatureBundleSchema>;

/* ------------------------------ Backend API ------------------------------ */

export const API_VERSION = 'v1';

/** Strict hostname validator: LDH labels, 1-253 chars, at least one dot, no IPs. */
export const hostnameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(253)
  .regex(/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/, 'invalid hostname');

export const analyzeRequestSchema = z
  .object({
    url: z.string().trim().max(2048).optional(),
    hostname: hostnameSchema.optional(),
  })
  .strict()
  .refine((v) => !!v.url || !!v.hostname, 'url or hostname is required');

export const reputationVerdictSchema = z.object({
  provider: z.string(),
  verdict: z.enum(['malicious', 'suspicious', 'clean', 'unknown']),
  categories: z.array(z.string()),
  detail: z.string().optional(),
  checkedAt: z.number(),
});

export const reputationResultSchema = z.object({
  status: z.enum(['ok', 'unavailable', 'error', 'not-configured']),
  hostname: z.string(),
  verdicts: z.array(reputationVerdictSchema),
  cached: z.boolean(),
  message: z.string().optional(),
});

export const apiErrorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string(), requestId: z.string().optional() }),
});

export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  version: z.string(),
  time: z.string(),
  checks: z.record(z.string(), z.enum(['ok', 'error', 'not-configured'])),
});

export const versionResponseSchema = z.object({
  api: z.string(),
  service: z.string(),
  build: z.string(),
  signatures: z.object({ technologies: z.string(), trackers: z.string() }),
});

export type AnalyzeRequest = z.infer<typeof analyzeRequestSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type VersionResponse = z.infer<typeof versionResponseSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
