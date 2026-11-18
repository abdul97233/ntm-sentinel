# NTM Sentinel Backend API (v1)

The backend is **optional**. The extension works fully offline; the API only adds
cloud reputation lookups and signature updates. Source: `apps/backend`.

- Base path: `/api/v1`
- Format: JSON (UTF-8). Request bodies require `Content-Type: application/json`.
- Validation: every input is validated with Zod (`packages/shared/src/schemas.ts`).
- The backend **never fetches user-supplied URLs**. Hostnames are only forwarded
  to fixed provider endpoints (Google Safe Browsing, VirusTotal).

## Cross-cutting behaviour

| Concern | Behaviour |
| --- | --- |
| CORS | Requests with an `Origin` not in `ALLOWED_ORIGINS` are rejected with `403 origin_not_allowed`. Extension origins look like `chrome-extension://<id>` (Chrome) and `extension://<id>` (Edge). In `ENVIRONMENT=development` any unpacked extension id and `http://localhost`/`127.0.0.1` are also accepted. Requests without an `Origin` are allowed (and rate limited). |
| Rate limit | 60 requests / 60 s per client, keyed by a salted SHA-256 hash of `CF-Connecting-IP` (raw IPs are never stored or logged). Uses the Workers Rate Limiting binding, which is per Cloudflare location and approximate. Exceeding it returns `429` with `Retry-After: 60`. |
| Body size | 16 KB max (1 MB for admin uploads), else `413`. |
| Headers | Every response has `X-Request-Id`, `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, a deny-all CSP, HSTS and `Cache-Control: no-store` unless stated otherwise. |
| Logging | Structured JSON. URLs are redacted (`redactUrl`); IPs, keys and tokens are omitted. Bodies are never logged. |

## Error format

```json
{ "error": { "code": "validation_failed", "message": "invalid hostname", "requestId": "3b1f…" } }
```

| HTTP | code | Meaning |
| --- | --- | --- |
| 400 | `invalid_json` | Body is not parseable JSON |
| 401 | `unauthorized` | Admin route without a bearer token |
| 403 | `forbidden` | Wrong admin token, or admin disabled |
| 403 | `origin_not_allowed` | `Origin` not allow-listed |
| 404 | `not_found` | Unknown route or signature kind |
| 413 | `payload_too_large` | Body over the limit |
| 415 | `unsupported_media_type` | Body not `application/json` |
| 422 | `validation_failed` | Schema or hostname policy violation |
| 429 | `rate_limited` | Rate limit exceeded |
| 500 | `internal_error` | Unexpected failure (details only in sanitised logs) |
| 503 | `service_unavailable` | Required binding (e.g. D1) missing |

## Endpoints

### `GET /api/v1/health`

```json
{
  "status": "ok",
  "version": "v1",
  "time": "2026-11-18T12:00:00.000Z",
  "checks": { "database": "ok", "cache": "ok", "reputation": "ok" }
}
```

Each check is `ok`, `error` or `not-configured`. If any check is `error`, `status`
is `degraded` and the HTTP status is `503`.

### `GET /api/v1/version`

```json
{
  "api": "v1",
  "service": "ntm-sentinel-api",
  "build": "production",
  "signatures": { "technologies": "2026.11.18", "trackers": "2026.11.18" }
}
```

### `POST /api/v1/security/analyze`

Request: exactly one of `url` or `hostname` (unknown fields are rejected).

```json
{ "url": "https://login.example.com/path?x=1" }
```

```json
{ "hostname": "login.example.com" }
```

Only the **hostname** is extracted and checked; the path and query are discarded
and never stored. Rejected (`422`):
- non-http(s) schemes (`file:`, `javascript:`, `data:` …)
- IP literals, including decimal/hex encodings
- single-label hosts, `localhost` and reserved suffixes (`.local`, `.internal`, `.lan`, `.home.arpa`, `.test`, `.onion` …)
- anything that fails the hostname grammar

Response: a `ReputationResult`:

```json
{
  "status": "ok",
  "hostname": "login.example.com",
  "cached": false,
  "verdicts": [
    {
      "provider": "google-safe-browsing",
      "verdict": "clean",
      "categories": [],
      "detail": "Not on Safe Browsing lists",
      "checkedAt": 1763467200000
    }
  ]
}
```

| `status` | Meaning |
| --- | --- |
| `ok` | At least one provider answered. If some failed, `message` says how many, and failed providers appear with verdict `unknown`. |
| `unavailable` | Every configured provider failed or timed out (4 s each). **No verdict is implied.** |
| `not-configured` | No providers are configured on this deployment. |
| `error` | Reserved for client-side use (the extension sets it when the request itself fails). |

`verdict` is `malicious`, `suspicious`, `clean` (the provider has no threat record,
which does **not** mean the site is guaranteed safe) or `unknown`.

Caching: complete results are cached in KV for 6 h when every verdict is `clean`,
otherwise for 1 h. Partial or failed results are never cached. A cached response has
`"cached": true`.

### `GET /api/v1/security/reputation/:hostname`

Same validation and response as `analyze`, taking the hostname from the path.

### `GET /api/v1/signatures/technologies`
### `GET /api/v1/signatures/trackers`

Returns the newest signature bundle: the latest valid D1 row, otherwise the bundle
shipped with the Worker (`@ntm/signatures`). The schemas are `techSignatureBundleSchema`
and `trackerSignatureBundleSchema`.

- `ETag` is a content hash; send `If-None-Match` to get `304 Not Modified`.
- `X-Signature-Source` is `database` or `bundled`.
- `Cache-Control: public, max-age=3600`.

Signatures are **data, never code**: regex patterns are length-limited and screened
for nested quantifiers (ReDoS) on both the server and the client.

### `PUT /api/v1/admin/signatures/:kind`

`kind` is `technologies` or `trackers`. Publishes a new bundle without an extension release.

- Header: `Authorization: Bearer <ADMIN_TOKEN>`. The token is compared in constant time.
- Disabled (`403`) unless `ADMIN_TOKEN` is set and at least 32 characters long.
- Body: a full bundle (max 1 MB), validated with Zod. Returns `201 { ok, kind, version }` or `422`.
- On success, the KV key `sigver:<kind>` is updated with `{ version, publishedAt }`.

## Provider notes

| Provider id (`REPUTATION_PROVIDERS`) | Secret | Endpoint | Terms |
| --- | --- | --- | --- |
| `gsb` | `GSB_API_KEY` | `POST https://safebrowsing.googleapis.com/v4/threatMatches:find` | Safe Browsing is for non-commercial use; commercial deployments should use Google Web Risk. |
| `virustotal` | `VT_API_KEY` | `GET https://www.virustotal.com/api/v3/domains/{domain}` | The public API has low quotas and is non-commercial. |
| `mock` | — | none (deterministic) | Development and tests only; ignored when `ENVIRONMENT=production`. |

`mock` verdicts: hosts containing `malicious-test` → `malicious`; `suspicious-test` → `suspicious`; everything else → `clean`.
