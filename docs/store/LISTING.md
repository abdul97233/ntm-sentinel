# Store listing copy (Chrome Web Store & Edge Add-ons)

Copy each field into the store dashboard. Character limits are noted where the stores enforce them.

## Name
NTM Sentinel

## Short description / summary (≤ 132 characters)
Local-first website security, privacy & tech-stack scanner with developer and API inspection tools. No account, no tracking.

## Category
- Chrome: **Developer Tools**
- Edge: **Developer tools**

## Language
English

## Detailed description

NTM Sentinel combines five website-intelligence tools in one extension. Everything runs locally in your browser.

🛡 SCAMLENS: SECURITY INDICATORS
Explainable checks for common phishing and scam patterns:
• raw IP addresses, punycode and mixed-alphabet (homograph) domains
• brand names on unrelated domains, and look-alike typosquats
• hidden redirect parameters, "@" credential tricks and URL obfuscation
• password forms on unencrypted pages or posting to another domain
• mixed content and missing security headers
Every finding shows its evidence, an explanation and a recommendation. NTM Sentinel never claims a site is "guaranteed safe".

👁 PRIVACYGUARD: TRACKERS & THIRD PARTIES
See which third-party domains a page contacted, which ones are known analytics, advertising, session-replay or fingerprinting services, cookie attributes (never values), storage usage, and optional fingerprinting-API indicators. Monitoring is passive: nothing is blocked.

🧱 STACKPEEK: TECHNOLOGY DETECTION
Detects about 80 frameworks, CMSs, libraries, analytics tools, CDNs, hosts and servers (React, Next.js, Vue, WordPress, Shopify, Tailwind, Cloudflare, Vercel and more), with confidence levels, versions where visible, and the exact evidence.

🎨 DEVLENS: DESIGN & DOM INSPECTOR
Pick any element to see its selector, box model and computed CSS. Extract the page's color palette (HEX/RGB/HSL) and typography, list images and fonts, open responsive preview windows, and export design tokens as JSON or CSS variables.

🔌 APIWATCH: NETWORK INSPECTOR IN DEVTOOLS
A dedicated DevTools panel with request filtering, a searchable JSON viewer, and export as cURL, JSON or Postman collection. Authorization headers, cookies and tokens are redacted by default.

🔒 PRIVACY FIRST
• No site access at install. Pages are read only after you click the icon or grant a site.
• No account, no ads, no analytics, no telemetry.
• Your browsing data stays on your device.
• Optional permissions (cookies, redirect tracking, all-sites access) are explained before you grant them, and can be revoked at any time.

Free. Built for developers, security enthusiasts, QA engineers, designers and privacy-conscious users.

## Single purpose (Chrome requires this field)
NTM Sentinel inspects the website the user is viewing and reports on it: its security indicators, privacy/tracking behaviour, technologies, page design (DOM/CSS) and network requests (in DevTools). All features serve that single purpose of website inspection and analysis.

## Required assets (still to create)

| Asset | Chrome | Edge |
| --- | --- | --- |
| Store icon | 128×128 PNG (`apps/extension/public/icons/icon-128.png`) | 300×300 PNG (recommended) |
| Screenshots | 1–5 at 1280×800 or 640×400 | 1–10 at 1280×800 or 640×480 |
| Small promo tile | 440×280 (optional) | 440×280 (optional) |
| Privacy policy URL | **Required:** must be a public URL | **Required:** must be a public URL |

> The repository is private, so `docs/PRIVACY.md` must be hosted publicly before you submit. Options: a public GitHub Gist, GitHub Pages from a separate public repo, or your own website.
