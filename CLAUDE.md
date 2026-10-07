# Repository instructions

- PR titles must be Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:` …); PRs are squash merged. Release Please derives versions and the changelog from them.
- Never publish packages or edit `.github/workflows` / `.github/scripts` from implementation work. See `docs/RELEASING.md`.
- Validation: `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test`, `node --test .github/scripts/*.test.cjs`, `node scripts/verify-package.mjs`.
- Keep telemetry non-blocking and credentials out of logs.
