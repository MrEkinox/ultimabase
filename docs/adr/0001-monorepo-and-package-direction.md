# ADR-0001: Monorepo and package direction

- Status: accepted
- Date: 2026-07-30

## Decision

Use Yarn workspaces in one monorepo. Packages depend toward `shared`, `schema`, `query`, `access`, `core`, and `runtime`. Concrete plugins sit above Runtime.

## Consequences

Cross-package changes stay atomic and contracts can be tested together. Dependency direction must be enforced to prevent Core or Runtime from knowing concrete implementations.
