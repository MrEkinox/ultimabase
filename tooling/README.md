# Tooling

Shared repository configuration lives here. Tooling packages must not become runtime dependencies.

## Test configuration

- `vitest/package.config.ts` scopes package commands to colocated unit tests and package-level tests.
- `tsconfig/test.json` provides strict shared compiler options for source-local, package-level, and cross-package tests.
- `documentation/active-contracts.test.ts` validates links, workspace package
  imports, optional-product examples, and obsolete-contract removal across
  active Markdown. Historical ADRs, issues, and plans are deliberately outside
  that active-document set.
