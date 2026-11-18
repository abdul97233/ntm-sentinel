# NTM Sentinel

**One browser. Complete intelligence.**

A local-first Manifest V3 extension for Chrome and Edge. It combines five engines:

| Engine | What it does | Where |
| --- | --- | --- |
| **ScamLens** | Explainable URL and page security indicators (IP hosts, punycode/homographs, brand impersonation, typosquats, open redirects, mixed content, insecure/cross-domain password forms, security headers, redirect chains). Optional cloud reputation lookup. | Side panel → Security |
| **PrivacyGuard** | Passive third-party and tracker observation, cookie attributes (never values), storage summary, opt-in fingerprinting-API monitor | Side panel → Privacy |
| **StackPeek** | Signature-based technology detection with evidence and confidence | Side panel → Technologies |
| **DevLens** | Element picker, computed CSS, box model, colors, typography, assets, responsive windows, design-token export | Side panel → Inspector |
| **APIWatch** | Network inspector built on the DevTools API: filters, JSON viewer, cURL/JSON/Postman export, redaction | DevTools → "NTM APIWatch" |

Free, with no account, no ads and no telemetry. The cloud backend is optional and off by default.

## Install a build (developer mode)

```bash
pnpm install
pnpm build:extension          # -> apps/extension/dist/chrome and dist/edge
```

- **Chrome:** open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and select `apps/extension/dist/chrome`.
- **Edge:** open `edge://extensions`, turn on **Developer mode**, click **Load unpacked**, and select `apps/extension/dist/edge`.

Store ZIPs: `pnpm package` writes them to `release/`.

## How access works

The extension requests no site access at install. It reads a page only when:
- you click the toolbar icon on that page (`activeTab`), or
- you grant that site, or all sites, from the dashboard or Settings.

Cookies, navigation (redirects) and all-sites access are optional permissions.

## Repository

```
apps/extension   React + TypeScript + Vite MV3 extension
apps/backend     Optional Cloudflare Worker (Hono, D1, KV): reputation, signature updates
packages/shared  Types, schemas, domain utils, local analysis engines, redaction
packages/signatures  Versioned technology and tracker signature bundles
docs/            API.md, DEPLOYMENT.md (more in progress)
```

Optional backend: `NTM_API_URL=https://your-worker.example pnpm build:extension` allows that origin in the CSP and enables the cloud toggles. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Status

v0.1.0, development build. Automated tests and the remaining docs (PERMISSIONS, PRIVACY, ARCHITECTURE, TESTING, store checklists) are still to come.
