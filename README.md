# Hexo Blog

This repository is ready for both GitHub Pages and Vercel deployments.

## Local development

```bash
npm install
npm run server
```

## Build

```bash
npm run build
```

The build script supports runtime overrides:

- `SITE_URL` sets the final site URL.
- `SITE_ROOT` sets the root path.

GitHub Pages injects both values automatically in Actions.
Vercel uses `VERCEL_PROJECT_PRODUCTION_URL` or `VERCEL_URL` when available.

## GitHub Pages

Push this repository to GitHub, then enable Pages with:

- Source: `GitHub Actions`

The workflow in [`.github/workflows/pages.yml`](.github/workflows/pages.yml) will publish the `public` folder.

## Vercel

Import this repository into Vercel, or deploy it from the local checkout.

`vercel.json` tells Vercel to:

- run `npm run build`
- publish the `public` directory

Vercel serves only the static blog. The Codex quota API runs on the home server.

## Live Codex weekly quota

The home-page slogan reads a sanitized weekly quota snapshot from
`https://quota.zongtech.xyz/api/codex-quota`. The data flow is:

1. `tools/publish-codex-quota.mjs` asks the local Codex app server for the
   current seven-day rate-limit window.
2. The publisher writes only the used/remaining percentages and timestamps to
   a public JSON Gist. Each update force-replaces the single snapshot commit,
   so an ongoing public quota history is not retained. ChatGPT credentials
   never leave the local machine.
3. `codex-quota-api.service` on the home server validates the snapshot, marks
   old data as stale or offline, and returns the Fluid-compatible `text` field.
4. The existing Cloudflare Tunnel publishes the loopback-only service as
   `quota.zongtech.xyz`; no new inbound server port is exposed.

Run a safe local probe without publishing:

```powershell
npm run quota:publish -- --dry-run
```

Publish to the configured snapshot:

```powershell
npm run quota:publish -- --gist-id 8292011e3b19e909282822590a696b8a
```

Install or repair the five-minute Windows publisher task:

```powershell
.\tools\install-codex-quota-task.ps1
```

The scheduled task runs only while this Windows user can access the local Codex
login and GitHub CLI credential. If the PC is asleep or offline, the API marks
the snapshot as stale instead of presenting it as live.

### Home-server service

The standalone API uses only Node.js built-ins. Run it locally with:

```bash
npm run quota:serve
```

Production uses these paths:

- application: `/opt/codex-quota-api`
- environment: `/etc/codex-quota-api.env`
- systemd unit: `/etc/systemd/system/codex-quota-api.service`
- loopback listener: `127.0.0.1:18731`

The reproducible service files are in `deploy/`. The public endpoints are:

- `/healthz` for process health
- `/readyz` for snapshot readiness without quota values
- `/api/codex-quota` for the public Fluid payload

The API permits browser requests only from the configured blog origins. Keep
the Node listener on loopback and publish it through Cloudflare Tunnel rather
than opening port `18731` in the server firewall.

