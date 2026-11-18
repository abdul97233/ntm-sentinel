/**
 * Data the content script collects from a page on demand. This is the single
 * input to the local StackPeek, PrivacyGuard and ScamLens page-level analysers.
 * It never contains cookie values, storage values, form values or page text.
 */
import type { StorageSummary } from './types';

export interface ResourceEntry {
  url: string;
  /** PerformanceResourceTiming.initiatorType: script, img, css, link, fetch, xmlhttprequest, ... */
  initiatorType: string;
}

export interface FormSummary {
  /** Resolved action URL (no query string). */
  action: string;
  method: string;
  hasPassword: boolean;
}

export interface PageSnapshot {
  url: string;
  title: string;
  collectedAt: number;
  scripts: string[];
  resources: ResourceEntry[];
  /** Total number of resource entries before truncation. */
  resourceTotal: number;
  /** name/property (lower-cased) -> content */
  meta: Record<string, string>;
  /** Selectors (requested by the caller) that matched at least one element. */
  matchedSelectors: string[];
  /** selector|attr -> attribute value, for version extraction rules. */
  selectorAttrs: Record<string, string>;
  classSample: string[];
  headerProbe: { status: 'ok' | 'failed' | 'disabled'; headers: Record<string, string>; error?: string };
  /** Names only, from document.cookie (non-HttpOnly cookies of the page's origin). */
  cookieNames: string[];
  forms: FormSummary[];
  passwordFieldCount: number;
  /** Elements on an https page that reference http:// subresources. */
  mixedContent: { tag: string; url: string }[];
  iframeCount: number;
  navigation: { redirectCount: number; type: string };
  storage: StorageSummary;
  /** Results of the read-only MAIN-world global probe: path -> stringified value or true. */
  globals: Record<string, string | true>;
  /** Fingerprinting API call counters, if the opt-in monitor was active on this page. */
  fingerprint: { monitored: boolean; counts: Record<string, number> };
}

export interface CollectRequest {
  selectors: string[];
  selectorAttrs: { selector: string; attr: string }[];
  headerProbe: boolean;
}
