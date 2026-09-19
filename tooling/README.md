# Tooling

Shared repository configuration lives here. Tooling packages must not become runtime dependencies.

## Test configuration

- `vitest/package.config.ts` separates package-local unit, type, built-export E2E,
  and PostgreSQL E2E projects. Unit discovery explicitly excludes E2E files.
- `vitest/test-discovery.test.ts` checks actual Vitest inventories and isolated
  TypeScript root files so moves cannot silently drop or duplicate suites.
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
