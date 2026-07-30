# Tooling

Shared configuration and repository-only scripts live here. Tooling packages must not become runtime dependencies.

## Build scripts

- `verify-packed-packages.ts` packs every publishable package and imports it from an isolated temporary ESM consumer.
