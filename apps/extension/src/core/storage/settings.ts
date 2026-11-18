import { z } from 'zod';

/** Persistent user settings (chrome.storage.local, key "settings"). */
export const settingsSchema = z.object({
  modules: z.object({
    scamlens: z.boolean(),
    devlens: z.boolean(),
    privacyguard: z.boolean(),
    stackpeek: z.boolean(),
    apiwatch: z.boolean(),
  }),
  /** Opt-in: send the current hostname to the NTM backend for reputation checks. */
  cloudReputation: z.boolean(),
  /** Opt-in: fetch signature updates from the backend (no browsing data is sent). */
  cloudSignatureUpdates: z.boolean(),
  /** Re-run local scans automatically when a page finishes loading (requires all-sites access). */
  autoScan: z.boolean(),
  /** Send one HEAD request to the scanned page's own origin to read response headers. */
  headerProbe: z.boolean(),
  /** Inject the MAIN-world fingerprinting API monitor at document_start (requires all-sites access). */
  fingerprintMonitor: z.boolean(),
  /** Keep a local scan history (hostname + summary only). */
  scanHistory: z.boolean(),
  historyLimit: z.number().int().min(10).max(1000),
  apiwatch: z.object({
    maxRequests: z.number().int().min(50).max(5000),
    captureBodies: z.boolean(),
    redactByDefault: z.boolean(),
  }),
  theme: z.enum(['dark', 'light', 'system']),
});

export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  modules: { scamlens: true, devlens: true, privacyguard: true, stackpeek: true, apiwatch: true },
  cloudReputation: false,
  cloudSignatureUpdates: false,
  autoScan: false,
  headerProbe: true,
  fingerprintMonitor: false,
  scanHistory: false,
  historyLimit: 100,
  apiwatch: { maxRequests: 1000, captureBodies: true, redactByDefault: true },
  theme: 'dark',
};

export const settingsPatchSchema = z
  .object({
    modules: settingsSchema.shape.modules.partial(),
    cloudReputation: z.boolean(),
    cloudSignatureUpdates: z.boolean(),
    autoScan: z.boolean(),
    headerProbe: z.boolean(),
    fingerprintMonitor: z.boolean(),
    scanHistory: z.boolean(),
    historyLimit: settingsSchema.shape.historyLimit,
    apiwatch: settingsSchema.shape.apiwatch.partial(),
    theme: settingsSchema.shape.theme,
  })
  .partial()
  .strict();

export type SettingsPatch = z.infer<typeof settingsPatchSchema>;

export function mergeSettings(base: Settings, patch: SettingsPatch): Settings {
  return settingsSchema.parse({
    ...base,
    ...patch,
    modules: { ...base.modules, ...(patch.modules ?? {}) },
    apiwatch: { ...base.apiwatch, ...(patch.apiwatch ?? {}) },
  });
}
