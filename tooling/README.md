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
  through `yarn check:issues`; CI executes the same focused test suite.
- `issues/current-plan.test.ts` keeps the short root checkpoint aligned with the
  issue/milestone tree and plan catalog. New/resumed active work must contain
  Working context; historical completed issues are not bulk-retrofitted.
- `documentation/current-architecture-index.test.ts` protects architecture
  routing and ADR status. Applicable detailed agent rules live under
  `docs/engineering`; these are active contracts, not archived execution logs.
