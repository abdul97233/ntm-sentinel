/**
 * Core domain types shared by the extension and the backend.
 * These are the contract between modules — change with care.
 */

export type RiskLevel = 'low' | 'moderate' | 'high' | 'critical' | 'unknown';
export type Severity = 'info' | 'low' | 'moderate' | 'high' | 'critical';
export type Confidence = 'high' | 'medium' | 'low';

/** Lifecycle of any engine result shown in the UI. */
export type ScanStatus =
  | 'not-scanned'
  | 'scanning'
  | 'completed'
  | 'failed'
  | 'unsupported'
  | 'permission-required';

export type EngineId = 'scamlens' | 'devlens' | 'privacyguard' | 'stackpeek' | 'apiwatch';

/** An explainable finding. Every security/privacy result must be one of these. */
export interface Finding {
  id: string;
  title: string;
  severity: Severity;
  /** Concrete observed evidence (never fabricated). */
  evidence: string;
  explanation: string;
  recommendation?: string;
  /** Where the evidence came from, e.g. "Local URL analysis". */
  source: string;
}

/* ----------------------------- ScamLens ----------------------------- */

export interface RedirectHop {
  url: string;
  /** e.g. server_redirect, client_redirect, link */
  qualifiers: string[];
  timestamp: number;
}

export interface ReputationVerdict {
  provider: string;
  /** 'malicious' | 'suspicious' | 'clean' (provider has no record of threat) | 'unknown' */
  verdict: 'malicious' | 'suspicious' | 'clean' | 'unknown';
  categories: string[];
  detail?: string;
  checkedAt: number;
}

export interface ReputationResult {
  status: 'ok' | 'unavailable' | 'error' | 'not-configured';
  hostname: string;
  verdicts: ReputationVerdict[];
  cached: boolean;
  message?: string;
}

export interface SecurityReport {
  url: string;
  hostname: string;
  riskLevel: RiskLevel;
  findings: Finding[];
  /** Which analyses actually ran, for honest coverage reporting. */
  coverage: { name: string; ran: boolean; note?: string }[];
  redirects: RedirectHop[];
  reputation?: ReputationResult;
  scannedAt: number;
}

/* --------------------------- PrivacyGuard --------------------------- */

export type TrackerCategory =
  | 'analytics'
  | 'advertising'
  | 'social'
  | 'tag-manager'
  | 'session-replay'
  | 'fingerprinting'
  | 'consent'
  | 'customer-engagement'
  | 'other';

export interface ThirdPartyConnection {
  hostname: string;
  registrableDomain: string;
  resourceTypes: string[];
  requestCount: number;
  service?: { id: string; name: string; category: TrackerCategory; company?: string };
  confidence: Confidence;
}

export interface CookieInfo {
  name: string;
  domain: string;
  path: string;
  /** epoch seconds, undefined for session cookies */
  expires?: number;
  session: boolean;
  secure: boolean;
  /** undefined when not observable (document.cookie fallback) */
  httpOnly?: boolean;
  sameSite: 'strict' | 'lax' | 'none' | 'unspecified';
  firstParty: boolean;
}

export interface StorageSummary {
  localStorage: { available: boolean; keyCount: number; approxBytes: number; keys: string[] };
  sessionStorage: { available: boolean; keyCount: number; approxBytes: number; keys: string[] };
  indexedDB: { available: boolean; databases: string[] };
  estimate?: { usage?: number; quota?: number };
}

export interface FingerprintSignal {
  api: string;
  kind: 'canvas' | 'webgl' | 'audio' | 'fonts' | 'navigator';
  count: number;
}

export interface PrivacyReport {
  url: string;
  firstPartyDomain: string;
  connections: ThirdPartyConnection[];
  cookies: { source: 'cookies-api' | 'document.cookie' | 'none'; items: CookieInfo[] };
  storage?: StorageSummary;
  fingerprinting: { monitored: boolean; signals: FingerprintSignal[] };
  findings: Finding[];
  totals: {
    thirdPartyDomains: number;
    knownTrackers: number;
    analytics: number;
    advertising: number;
    unknown: number;
  };
  scannedAt: number;
}

/* ---------------------------- StackPeek ----------------------------- */

export type TechCategory =
  | 'frontend-framework'
  | 'meta-framework'
  | 'cms'
  | 'ecommerce'
  | 'js-library'
  | 'css-framework'
  | 'analytics'
  | 'tag-manager'
  | 'cdn'
  | 'hosting'
  | 'server'
  | 'security'
  | 'font'
  | 'other';

export interface DetectedTechnology {
  id: string;
  name: string;
  category: TechCategory;
  confidence: Confidence;
  version?: string;
  evidence: string[];
  website?: string;
}

export interface StackReport {
  url: string;
  technologies: DetectedTechnology[];
  signatureVersion: string;
  scannedAt: number;
}

/* ------------------------------ Shared ------------------------------ */

export interface EngineState<T> {
  status: ScanStatus;
  data?: T;
  error?: string;
  updatedAt?: number;
}

export interface TabScanState {
  tabId: number;
  url: string;
  hostname: string;
  security: EngineState<SecurityReport>;
  privacy: EngineState<PrivacyReport>;
  stack: EngineState<StackReport>;
  /** Number of requests observed by APIWatch in DevTools, if the panel is open. */
  apiRequestCount?: number;
  updatedAt: number;
}

export interface ScanHistoryEntry {
  hostname: string;
  riskLevel: RiskLevel;
  trackerCount: number;
  techCount: number;
  scannedAt: number;
}
