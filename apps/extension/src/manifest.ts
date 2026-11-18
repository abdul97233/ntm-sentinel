/**
 * Manifest V3 generator. One source of truth for Chrome and Edge; browser-specific
 * differences are applied centrally here.
 */

export type TargetBrowser = 'chrome' | 'edge';

export interface ManifestOptions {
  browser: TargetBrowser;
  version: string;
  /** Origin of the optional NTM backend, e.g. https://api.example.com. Empty = no cloud. */
  apiOrigin: string;
  /** Adds http://localhost host access so Playwright can scan local fixtures without a user gesture. */
  e2e?: boolean;
  dev?: boolean;
}

export function createManifest(opts: ManifestOptions): chrome.runtime.ManifestV3 {
  const connectSrc = ["'self'"];
  if (opts.apiOrigin) connectSrc.push(opts.apiOrigin);
  if (opts.dev) connectSrc.push('http://127.0.0.1:8787', 'http://localhost:8787');

  const manifest: chrome.runtime.ManifestV3 = {
    manifest_version: 3,
    name: 'NTM Sentinel',
    short_name: 'NTM Sentinel',
    version: opts.version,
    description:
      'One browser. Complete intelligence. Security, privacy, tech-stack, developer and API inspection — local-first.',
    // chrome.sidePanel.open() requires Chromium 116+. Edge uses the same Chromium versioning.
    minimum_chrome_version: '116',
    icons: { '16': 'icons/icon-16.png', '32': 'icons/icon-32.png', '48': 'icons/icon-48.png', '128': 'icons/icon-128.png' },
    action: {
      default_title: 'NTM Sentinel',
      default_popup: 'src/popup/index.html',
      default_icon: { '16': 'icons/icon-16.png', '32': 'icons/icon-32.png', '48': 'icons/icon-48.png' },
    },
    background: { service_worker: 'background.js', type: 'module' },
    side_panel: { default_path: 'src/sidepanel/index.html' },
    devtools_page: 'src/devtools/index.html',
    // Minimal required permissions. No host permissions are granted at install time.
    permissions: ['storage', 'activeTab', 'scripting', 'sidePanel'],
    // Requested at runtime, only after the user opts in from Settings or a feature prompt.
    optional_permissions: ['cookies', 'webNavigation'],
    optional_host_permissions: ['https://*/*', 'http://*/*'],
    commands: {
      _execute_action: { suggested_key: { default: 'Alt+Shift+S' }, description: 'Open NTM Sentinel' },
    },
    content_security_policy: {
      extension_pages: `script-src 'self'; object-src 'self'; base-uri 'none'; frame-ancestors 'none'; connect-src ${connectSrc.join(' ')}`,
    },
  } as chrome.runtime.ManifestV3;

  if (opts.e2e) {
    manifest.host_permissions = ['http://localhost/*', 'http://127.0.0.1/*'];
  }

  if (opts.browser === 'edge') {
    // Edge accepts the Chrome MV3 manifest as-is (side_panel, devtools_page, module SW).
    // Hook kept for store-specific divergence (e.g. update_url differences) when required.
  }

  return manifest;
}
