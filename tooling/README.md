# Tooling

Shared repository configuration lives here. Tooling packages must not become runtime dependencies.

## Test configuration

- `vitest/package.config.ts` scopes package commands to their local runtime and compile-time tests.
- `tsconfig/test.json` provides strict shared compiler options for package and cross-package tests.
