# NTM Sentinel Privacy Policy

_Last updated: 18 November 2026 · Applies to NTM Sentinel v0.1.0 and later_

NTM Sentinel is a browser extension for Google Chrome and Microsoft Edge. It analyses websites for security indicators, privacy and tracking behaviour, and the technologies they use, and it provides developer inspection tools. **It is designed to run locally: analysis happens inside your browser.**

## Summary

- We do **not** collect, sell or share personal data.
- We do **not** track you, show ads, or include analytics or telemetry.
- No account is needed.
- Browsing history, cookies, page content and network data stay **on your device**.
- The only feature that can send data off your device is the **optional** cloud reputation check. It is off by default, and it sends only a hostname, and only when you click "Check".

## What the extension reads, and when

NTM Sentinel reads a web page only after you allow it:
- when you click the toolbar icon on that page (Chrome's `activeTab` mechanism), or
- when you grant access to that site, or to all sites, from the extension.

When it analyses a page, it reads the information below **on your device**:

| Data | Purpose | Leaves your device? |
| --- | --- | --- |
| Page URL and hostname | Security indicators (ScamLens) | No (see cloud reputation below) |
| Page structure: script/stylesheet URLs, meta tags, CSS class names, forms (presence of password fields, form destinations), not form values | Technology detection, security checks | No |
| URLs of resources the page loaded (via the browser's Performance API) | Third-party and tracker detection | No |
| Response headers of the current page (one HEAD request to the same site you are viewing; can be turned off) | Security headers, server/CDN detection | No |
| Cookie **names and attributes** (domain, expiry, Secure, HttpOnly, SameSite). **Cookie values are never read into the interface or stored.** | Privacy analysis | No |
| localStorage / sessionStorage **key names, counts and approximate sizes**, and IndexedDB database names. **Stored values are never extracted.** | Privacy analysis | No |
| Counts of calls to canvas/WebGL/audio APIs (only if you enable the fingerprinting monitor) | Fingerprinting indicators | No |
| Computed styles, colors, fonts and image URLs of elements you inspect | DevLens developer tools | No |
| Network requests shown in DevTools (only while you have the NTM APIWatch panel open) | API debugging | No. Kept in memory and discarded when DevTools closes. |
| Top-level navigation URLs per tab (only if you grant the optional navigation permission) | Redirect-chain display | No. Kept in session memory and cleared when the tab or browser closes. |

## What is stored locally

Data is kept in your browser's extension storage on your device:
- **Settings:** stored until you change or delete them.
- **Scan results for open tabs:** kept in session storage, cleared when the tab or browser closes.
- **Scan history:** **off by default**. If you turn it on, it stores hostname, risk level, tracker count and technology count, up to a limit you choose.
- **Cached signature lists:** technology and tracker definitions.

You can delete all of it at any time from **Settings → Data & history → Delete all local data**. Uninstalling the extension also removes it.

## Optional cloud features (off by default)

If the extension is built with an NTM backend and you turn these features on in Settings:

- **Cloud reputation:** when you click "Check" on the Security page, the **hostname only** (for example `example.com`) is sent to the NTM backend. The URL path, query string, cookies and page content are never sent. The backend may forward the hostname to the threat-intelligence providers it is configured with, such as Google Safe Browsing or VirusTotal, under their own terms. Results may be cached on the backend, keyed by hostname, for up to 6 hours. The backend does not store who requested a lookup. For abuse protection, rate limiting uses a one-way hash of the requesting IP address, and raw IP addresses are not logged.
- **Signature updates:** the extension downloads updated technology and tracker lists. **No browsing data is sent.**

The v0.1.0 release has **no backend configured**, so none of the data above is sent anywhere.

## Exports

APIWatch and DevLens can export data (requests, design tokens, asset lists) to a file on your computer, but only when you choose to. Sensitive headers and tokens are redacted by default, and you are warned before exporting.

## Permissions

See [PERMISSIONS.md](PERMISSIONS.md) for every permission, why it is needed, and whether it is optional.

## Children

NTM Sentinel is a general-purpose developer and security tool. It is not directed at children and collects no personal information from anyone.

## Changes

If this policy changes, the updated version will be published with the extension's release notes, with a new "Last updated" date. Any change that sends new data off your device will be opt-in.

## Contact

Questions or concerns: open an issue in the project repository, or use the support contact on the extension's store listing.
