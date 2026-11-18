# Permissions

NTM Sentinel asks for the smallest set of permissions it needs. **It has no access to any website when installed.** Broader access is optional, explained where you grant it, and can be revoked at any time from **Settings → Permissions** or the browser's extension settings.

## Required permissions

| Permission | Why it's needed | What it exposes |
| --- | --- | --- |
| `storage` | Saves settings, current scan results (session storage) and cached signature lists on your device. | Only NTM Sentinel's own data. |
| `activeTab` | When you click the toolbar icon, NTM Sentinel gets temporary access to **that tab only** so it can scan it. This is the default way the extension reads a page. | The current tab, temporarily, after you click. The access ends when you navigate away or close the tab. |
| `scripting` | Injects NTM Sentinel's bundled analysis script into a page you have allowed it to read (activeTab or a granted site). It is also used to register the opt-in fingerprinting monitor. No remote code is ever run. | Nothing by itself. It only works on pages the extension already has access to. |
| `sidePanel` | Shows the main dashboard in the browser's side panel. | Nothing. |

## Optional permissions

These are requested only at runtime, after you click a button that explains what they're for.

| Permission | Feature | What it exposes |
| --- | --- | --- |
| Host access for one site (`https://example.com/*`) | Lets the side panel scan that site without clicking the toolbar icon each time. | Content of pages on that site, read locally only. |
| Host access for all sites (`https://*/*`, `http://*/*`) | Auto-scan when pages load, and the fingerprinting monitor, which has to run before page scripts. | Content of pages you visit, read locally only. |
| `cookies` | PrivacyGuard cookie analysis: names, domains, expiry and Secure/HttpOnly/SameSite flags. **Values are discarded immediately and never shown or stored.** It also needs host access for the site. | Cookie metadata for sites you've granted. |
| `webNavigation` | ScamLens redirect-chain display. | Top-level navigation URLs and transition types. Kept per tab in session memory, cleared when the tab or browser closes, never uploaded. |

## Other manifest entries

| Entry | Purpose |
| --- | --- |
| `devtools_page` | Adds the **NTM APIWatch** panel to DevTools. It uses the DevTools network API, which only sees the inspected tab while DevTools is open. |
| `commands` (`Alt+Shift+S`) | Keyboard shortcut to open the popup. This grants activeTab, the same as clicking the icon. |
| Content Security Policy | `script-src 'self'`: no remote or inline scripts and no `eval`. `connect-src` only allows the extension itself and, if configured at build time, the NTM backend origin. |

## Not requested

- **`tabs`:** not needed. Tab URLs are only visible after you grant access.
- **`webRequest` / `declarativeNetRequest`:** NTM Sentinel only observes, and never blocks or modifies requests.
- **`history`, `downloads`, `management`, `<all_urls>` at install:** not used.
