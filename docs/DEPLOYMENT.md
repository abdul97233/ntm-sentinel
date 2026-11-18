# Deploying the NTM Sentinel backend

The backend (`apps/backend`) is an **optional** Cloudflare Worker (Hono + D1 + KV +
Workers Rate Limiting). The extension works without it. Nothing in this guide has
been run against a real Cloudflare account by the project authors; follow it step by
step and verify each result yourself.

> **Pricing and quotas change.** Before deploying, check the current Workers, D1, KV
> and Rate Limiting pricing and free-tier limits at
> https://developers.cloudflare.com/workers/platform/pricing/ and the D1/KV limits
> pages. Do not assume today's free-tier limits are permanent. Also check the
> current terms of any threat-intelligence provider you enable.

## Prerequisites

- Node.js ≥ 20.19 and pnpm (see the root `package.json`)
- A Cloudflare account
- Wrangler ≥ 4.36, installed as a dev dependency (`pnpm --filter @ntm/backend exec wrangler --version`)

```bash
pnpm install
cd apps/backend
pnpm exec wrangler login
```

## 1. Create D1 databases

```bash
pnpm exec wrangler d1 create ntm-sentinel-dev
pnpm exec wrangler d1 create ntm-sentinel-prod
```

Copy each `database_id` into `wrangler.jsonc`, replacing
`REPLACE_WITH_DEV_D1_DATABASE_ID` (top level) and `REPLACE_WITH_PROD_D1_DATABASE_ID`
(`env.production`).

## 2. Apply migrations

Migrations live in `apps/backend/migrations/`.

```bash
pnpm db:migrate:local                                           # local Miniflare D1
pnpm exec wrangler d1 migrations apply DB --remote              # dev database
pnpm db:migrate:remote                                          # production (--env production)
```

## 3. Create KV namespaces

```bash
pnpm exec wrangler kv namespace create CACHE
pnpm exec wrangler kv namespace create CACHE --env production
```

Replace `REPLACE_WITH_DEV_KV_NAMESPACE_ID` and `REPLACE_WITH_PROD_KV_NAMESPACE_ID`.

KV holds only reputation cache entries (`rep:v1:*`, TTL 1–6 h) and signature version
metadata (`sigver:*`). No personal data.

## 4. Rate limiting binding

`wrangler.jsonc` declares a top-level `ratelimits` binding named `RATE_LIMITER`
(60 requests / 60 s; `period` must be 10 or 60). The `namespace_id` is any integer
you choose that is unique in your account (dev `1001`, prod `1002`). The limiter is
enforced per Cloudflare location and is approximate. For strict abuse protection,
add WAF rate-limiting rules in front of the Worker.

## 5. Configure variables and secrets

Non-secret vars live in `wrangler.jsonc`:

| Var | Dev | Production |
| --- | --- | --- |
| `ENVIRONMENT` | `development` | `production` |
| `ALLOWED_ORIGINS` | empty (any unpacked id + localhost accepted in dev) | `chrome-extension://<chrome-id>,extension://<edge-id>` |
| `REPUTATION_PROVIDERS` | `mock` | `gsb` and/or `virustotal` (`mock` is ignored in production) |
| `BUILD_ID` | `dev` | e.g. a git SHA, set by CI |

Find the published extension ids in the Chrome Web Store and Edge Add-ons dashboards
after the first upload. Unpacked ids differ from store ids.

Secrets are never committed:

```bash
pnpm exec wrangler secret put GSB_API_KEY --env production
pnpm exec wrangler secret put VT_API_KEY --env production      # optional
pnpm exec wrangler secret put ADMIN_TOKEN --env production     # >= 32 chars, e.g. openssl rand -hex 32
```

For local development, copy `.dev.vars.example` to `.dev.vars`.

## 6. Run locally

```bash
pnpm dev            # wrangler dev → http://127.0.0.1:8787
curl http://127.0.0.1:8787/api/v1/health
```

Development builds of the extension allow `http://127.0.0.1:8787` in their CSP
`connect-src`.

## 7. Deploy

```bash
pnpm deploy:dry     # bundle only (wrangler deploy --dry-run --outdir dist)
pnpm deploy         # wrangler deploy --env production
```

Then:
1. Check health: `curl https://<worker-host>/api/v1/health`.
2. Build the extension with the production API origin (see `docs/DEVELOPMENT.md`).
   The extension CSP only allows `connect-src` to that origin.

## 8. Publish signature updates (optional)

```bash
curl -X PUT https://<worker-host>/api/v1/admin/signatures/technologies \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  --data @technologies.json
```

The bundle is validated (schema, ReDoS screening) before it is stored. Clients pick
it up through `ETag`-aware polling.

## 9. GitHub Actions

`.github/workflows/backend.yml`:
- **Pull requests / pushes** touching the backend or shared packages: install, typecheck, test.
- **Pushes to `main`**: after tests pass, the `deploy` job runs in the GitHub
  environment `production`. Configure that environment with **required reviewers**
  so every deployment needs manual approval.

Required repository/environment secrets:

| Secret | Purpose |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | API token with *Workers Scripts:Edit*, *D1:Edit*, *Workers KV Storage:Edit* for the account |
| `CLOUDFLARE_ACCOUNT_ID` | Account id |

The workflow applies D1 migrations remotely, then runs `wrangler deploy --env production`.
Provider keys and `ADMIN_TOKEN` stay in Cloudflare (`wrangler secret put`), never in GitHub.

## Environment separation

| | Development | Production |
| --- | --- | --- |
| Worker name | `ntm-sentinel-api-dev` | `ntm-sentinel-api` |
| D1 | `ntm-sentinel-dev` | `ntm-sentinel-prod` |
| KV | dev namespace | prod namespace |
| Rate limit namespace | 1001 | 1002 |
| CORS | permissive for unpacked/localhost | exact store ids only |
| Providers | mock | real (keys as secrets) |

## Rollback

```bash
pnpm exec wrangler deployments list --env production
pnpm exec wrangler rollback --env production
```

D1 migrations are forward-only; write a new migration to revert schema changes.
