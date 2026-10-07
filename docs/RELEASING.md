# Releasing @doclight/node

Status: **repository-local preparation only.** The Release Please workflow, npm publish job and merge-controller wiring are protected automation paths and must be added by a trusted maintainer (see sdk-node#5). Until then `.github/workflows/release.yml` still uses Changesets. Nothing here claims a published npm release.

## Intended flow
1. Implementation PRs use Conventional Commit titles (`feat:`, `fix:`, `chore:` …) and are **squash merged**, so the title becomes the release-note commit.
2. Release Please (`release-please-config.json`, `.release-please-manifest.json`) opens/updates a release PR with the version, `CHANGELOG.md` and lockfile changes.
3. Merging the release PR creates the tag/GitHub Release; the same workflow then checks out that exact tag, validates and publishes with `secrets.NPM_TOKEN`.

## First release
The manifest is seeded at `0.1.0` (the unreleased metadata version), so the first `fix:` release yields `0.1.1`. Verify npm and GitHub release history before the first run.

## Pre-publish validation
`pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm build && pnpm test && node scripts/verify-package.mjs`

`scripts/verify-package.mjs` packs the tarball, checks name/access/repository metadata and contents, and installs it into clean ESM and CJS consumers. It never publishes. It needs `@doclight/core` to be resolvable from npm.

## Required external setup (unverified)
- Actions secret `NPM_TOKEN` with publish rights to `@doclight/node` (and org/2FA policy permitting automation).
- Credential allowing release-PR creation to trigger CI (`GITHUB_TOKEN` events are suppressed); confirm `PROJECTS_TOKEN` permissions first.
- `@doclight/core@^0.1.0` published to npm.

## Failed-publish recovery
Re-run the failed publish job for the existing release tag. Recovery must publish only the verified tag/commit, never current `main`, and must skip a version already on the registry.
