# ADR-0250: Package-owned E2E and isolated test typechecks

- Status: accepted
- Date: 2026-09-19
- Extends: ADR-0036, ADR-0086

## Decision

A suite belongs to the package whose contract it verifies, even when its test
application installs supporting packages. Package-owned built-export and live
PostgreSQL suites live under `packages/<package>/tests/e2e/`. Tests of complete
applications, transport parity, independent kernel alternatives, and repository
archive inventory remain under root `tests/e2e/`.

Unit and compile-time tests retain their source-local or package-level locations.
Each workspace uses a scoped `tsconfig.test.json`; shared application option
declarations are explicit fixtures and never require importing another executable
test suite. Package-owned fixture declarations may reference that package's own
source types, preserving the nominal identities asserted by source tests.

Package and root Vitest commands separate `unit`, `types`, `e2e`, and
`postgres-e2e`. E2E files are excluded from unit discovery. Built-export tests
continue to resolve the public compiled exports. Root coverage additionally runs
the existing source-aliased E2E projects, preserving its production inclusion,
thresholds, and explicit artifact-only exclusions.

PostgreSQL infrastructure lives in shared `tests/fixtures/`. One global container
per selected PostgreSQL project and one isolated schema per fork remain unchanged.
Moving a suite does not introduce a container per file or shared application state.

## Consequences

Every package can execute unit tests, type tests, and built E2E independently.
Root commands retain all suites. Tests protect discovery, coverage membership,
and compiler-root ownership against silent omissions and duplicate execution.

This change establishes test ownership only. It does not implement Git diff
selection, reverse-dependency CI scheduling, caching, or new coverage thresholds.
