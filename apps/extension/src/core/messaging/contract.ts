/**
 * Typed runtime messaging contract.
 *
 * Every message between extension contexts is declared here with a Zod schema for
 * its payload. The background router rejects anything that is not declared or
 * whose payload does not validate. Responses are wrapped in a Result envelope.
 */
import { z } from 'zod';
import type {
  AssetItem,
  ColorSwatch,
  ElementInspection,
  ReputationResult,
  ScanHistoryEntry,
  TabScanState,
  TypographyReport,
  ViewportInfo,
  CookieInfo,
} from '@ntm/shared';
import type { Settings } from '../storage/settings';
import { settingsPatchSchema } from '../storage/settings';

const tabId = z.number().int().nonnegative();

export const engineScanSchema = z.enum(['security', 'privacy', 'stack']);
export type EngineScan = z.infer<typeof engineScanSchema>;

/** Host access available for a tab. */
export interface AccessStatus {
  tabId: number;
  url: string;
  hostname: string;
  /** http(s) page we are able to analyse at all (not chrome://, store pages, PDFs...). */
  supported: boolean;
  unsupportedReason?: string;
  /** We can inject into this tab right now (activeTab grant or host permission). */
  canAccess: boolean;
  /** Persistent host permission for this origin. */
  originGranted: boolean;
  /** Persistent "all sites" access (optional host permissions granted). */
  allSitesGranted: boolean;
  cookiesPermission: boolean;
  webNavigationPermission: boolean;
}

export interface BackendStatus {
  configured: boolean;
  enabled: boolean;
  reachable: boolean | null;
  apiOrigin: string;
  checkedAt?: number;
  message?: string;
}

/** Request payload schemas, keyed by message type. */
export const requestSchemas = {
  // ---- tab / scan orchestration ----
  'tab/active': z.object({}).strict(),
  'access/status': z.object({ tabId }).strict(),
  'scan/run': z.object({ tabId, engines: z.array(engineScanSchema).min(1).optional() }).strict(),
  'scan/get': z.object({ tabId }).strict(),
  'reputation/check': z.object({ tabId }).strict(),
  'cookies/analyze': z.object({ tabId }).strict(),
  // ---- settings, history, data ----
  'settings/get': z.object({}).strict(),
  'settings/update': z.object({ patch: settingsPatchSchema }).strict(),
  'history/get': z.object({}).strict(),
  'history/clear': z.object({}).strict(),
  'data/clearAll': z.object({}).strict(),
  'backend/status': z.object({ refresh: z.boolean().optional() }).strict(),
  'signatures/update': z.object({}).strict(),
  'signatures/info': z.object({}).strict(),
  'fingerprint/sync': z.object({}).strict(),
  // ---- DevLens (background ensures the content script, then forwards to the tab) ----
  'devlens/pickerStart': z.object({ tabId }).strict(),
  'devlens/pickerStop': z.object({ tabId }).strict(),
  'devlens/inspectSelector': z.object({ tabId, selector: z.string().min(1).max(1000) }).strict(),
  'devlens/colors': z.object({ tabId }).strict(),
  'devlens/typography': z.object({ tabId }).strict(),
  'devlens/assets': z.object({ tabId }).strict(),
  'devlens/viewport': z.object({ tabId }).strict(),
  'devlens/openResponsive': z
    .object({ tabId, width: z.number().int().min(200).max(7680), height: z.number().int().min(200).max(4320) })
    .strict(),
  // ---- APIWatch (DevTools panel reports its observed request count for the Overview) ----
  'apiwatch/count': z.object({ tabId, count: z.number().int().nonnegative() }).strict(),
} as const;

export type MessageType = keyof typeof requestSchemas;
export type RequestOf<T extends MessageType> = z.infer<(typeof requestSchemas)[T]>;

/** Response types, keyed by message type. */
export interface ResponseMap {
  'tab/active': { tabId: number; url: string; title: string } | null;
  'access/status': AccessStatus;
  'scan/run': TabScanState;
  'scan/get': TabScanState | null;
  'reputation/check': ReputationResult;
  'cookies/analyze': { status: 'ok' | 'permission-required' | 'unsupported'; cookies: CookieInfo[] };
  'settings/get': Settings;
  'settings/update': Settings;
  'history/get': ScanHistoryEntry[];
  'history/clear': { ok: true };
  'data/clearAll': { ok: true };
  'backend/status': BackendStatus;
  'signatures/update': { technologies: string; trackers: string; updated: boolean; message?: string };
  'signatures/info': { technologies: string; trackers: string; source: 'bundled' | 'remote'; lastCheckedAt?: number };
  'fingerprint/sync': { registered: boolean };
  'devlens/pickerStart': { ok: true };
  'devlens/pickerStop': { ok: true };
  'devlens/inspectSelector': ElementInspection | null;
  'devlens/colors': ColorSwatch[];
  'devlens/typography': TypographyReport;
  'devlens/assets': AssetItem[];
  'devlens/viewport': ViewportInfo;
  'devlens/openResponsive': { windowId: number };
  'apiwatch/count': { ok: true };
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: string; code?: string };

export interface Envelope<T extends MessageType = MessageType> {
  channel: 'ntm';
  type: T;
  payload: RequestOf<T>;
}

/* ------------------------- Events (broadcasts) ------------------------- */

/**
 * One-way notifications sent with chrome.runtime.sendMessage to all extension pages.
 * Content scripts emit 'devlens/elementSelected' and 'devlens/pickerClosed';
 * the background emits 'scan/updated' and 'settings/changed'.
 */
export type EventMessage =
  | { channel: 'ntm-event'; type: 'scan/updated'; tabId: number }
  | { channel: 'ntm-event'; type: 'settings/changed' }
  | { channel: 'ntm-event'; type: 'devlens/elementSelected'; tabId?: number; inspection: ElementInspection }
  | { channel: 'ntm-event'; type: 'devlens/pickerClosed' };

/* ----------------- Background -> content script protocol ----------------- */

export type ContentRequest =
  | { channel: 'ntm-content'; type: 'ping' }
  | { channel: 'ntm-content'; type: 'collect'; request: import('@ntm/shared').CollectRequest }
  | { channel: 'ntm-content'; type: 'devlens/pickerStart' }
  | { channel: 'ntm-content'; type: 'devlens/pickerStop' }
  | { channel: 'ntm-content'; type: 'devlens/inspectSelector'; selector: string }
  | { channel: 'ntm-content'; type: 'devlens/colors' }
  | { channel: 'ntm-content'; type: 'devlens/typography' }
  | { channel: 'ntm-content'; type: 'devlens/assets' }
  | { channel: 'ntm-content'; type: 'devlens/viewport' };
