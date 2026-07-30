# Tooling

Shared configuration and repository-only scripts live here. Tooling packages must not become runtime dependencies.

## Test configuration

- `vitest/package.config.ts` scopes package commands to their local `tests` directory.

## Build scripts

- `verify-packed-packages.ts` packs every publishable package and imports it from an isolated temporary ESM consumer.
