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

## Live Codex weekly quota

The home-page slogan reads a sanitized weekly quota snapshot from
`/api/codex-quota`. The data flow is:

1. `tools/publish-codex-quota.mjs` asks the local Codex app server for the
   current seven-day rate-limit window.
2. The publisher writes only the used/remaining percentages and timestamps to
   a public JSON Gist. Each update force-replaces the single snapshot commit,
   so an ongoing public quota history is not retained. ChatGPT credentials
   never leave the local machine.
3. The Vercel function validates that snapshot, marks old data as stale or
   offline, and returns the Fluid-compatible `text` field.

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

