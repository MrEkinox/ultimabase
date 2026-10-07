# Tooling

Shared repository configuration lives here. Tooling packages must not become runtime dependencies.

GitHub-only check selection is described in [ci/README.md](ci/README.md). Standard
GitHub actions and Yarn handle changed paths and workspace dependants; local test
commands retain complete discovery.

## Test configuration

- `vitest/package.config.ts` separates package-local unit, type, built-export E2E,
  and PostgreSQL E2E projects. Unit discovery explicitly excludes E2E files.
- `vitest/test-discovery.test.ts` checks actual Vitest inventories and isolated
  TypeScript root files so moves cannot silently drop or duplicate suites.
- `vitest/typescript-language-service.ts` keeps editor-contract tests on
  TypeScript's real language service. Compatible completion and QuickInfo
  markers should share one fixture program; source and built-package contracts
  remain separate when their module resolution differs.
- `tsconfig/test.json` provides strict shared compiler options and the complete root test
  program. Each package overrides the root files in `tsconfig.test.json` and
  explicitly includes shared application option declaration fixtures.
- `documentation/active-contracts.test.ts` validates links, workspace package
  imports, optional-product examples, and obsolete-contract removal across
  active Markdown. Historical ADRs, issues, and plans are deliberately outside
  that active-document set.
- `issues/backlog-metadata.ts` validates canonical issue and milestone status,
  dependencies, milestone ownership, and explicit merged-issue targets. Run it
  through `yarn check:issues`; CI executes the same focused test suite. The
  backlog is now the frozen archive of the reference's development, and these
  guards keep that archive internally consistent.
- `issues/current-plan.test.ts` keeps the archived root checkpoint
  (`CURRENT_PLAN.md`) aligned with the issue/milestone tree and plan catalog.
  Resumed active work must contain Working context; historical completed issues
  are not bulk-retrofitted.
- `documentation/current-architecture-index.test.ts` protects architecture
  routing and ADR status. Applicable detailed agent rules live under
  `docs/engineering`; these are active contracts, not archived execution logs.

## Rebuild tooling

These scripts support the package-by-package rebuild described in
[`docs/rebuild/`](../docs/rebuild/PROTOCOL.md). No root script runs them; they
produce evidence, not validation gates.

- `rebuild-worktree.sh <name> [base-ref]` creates
  `../claude-ultimabase-worktrees/<name>` on branch `rebuild/<name>` (reusing the
  branch if it exists) and installs dependencies from the shared Yarn cache.
- `measure-rebuild.mjs [root] [--json]` measures Git-tracked files of any
  checkout, reference or rebuild, by category (production, tests, generated,
  documentation, tooling) in non-blank lines, with production lines per package
  and the published runtime dependencies.
- `rebuild/dx-audit.mjs <refRoot> <rebuildRoot> [--out dir] [--only …]` compares
  what an editor shows for both built roots: declarations, exports, hovers,
  completions and diagnostics. See
  [DX-AUDIT.md](../docs/rebuild/DX-AUDIT.md).
- `architecture/measure-simplification.ts` and
  `architecture/measure-runtime-baseline.ts` are the reference's own
  simplification measurements, kept unchanged.

[VALIDATIONS.md](../docs/rebuild/VALIDATIONS.md) maps each repository
validation command to what it covers in the reference and the rebuild.
