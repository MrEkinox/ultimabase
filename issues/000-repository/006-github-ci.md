# 006: Add GitHub Actions CI

- Status: in-progress
- Milestone: 0
- Packages: repository
- Depends on: 001, 002, 003, 004, 005
- ADR: ADR-0011, ADR-0012

## Goal

Run install, format, lint, typecheck, unit tests, integration tests, and build on GitHub.

## Acceptance criteria

- [x] CI uses Node 24 and immutable Yarn installs.
- [x] PostgreSQL integration jobs have Docker access.
- [x] Jobs cache safe Yarn artifacts.
- [x] Concurrency cancels obsolete branch runs.

## Tests

- [x] Validate workflow syntax.
- [ ] Record the first successful workflow run.

## Implementation notes

- One Ubuntu 24.04 job keeps the initial CI easy to understand while the repository remains small.
- Official checkout, Node setup, and cache actions run on their Node 24 major versions.
- Corepack is enabled before Yarn runs, and immutable registry archives under `.yarn/cache` are keyed by the lockfile.
- The runner verifies Docker access before E2E tests so future Testcontainers suites inherit the same environment.
- Workflow-level concurrency keeps only the latest run for each Git reference.
- Typechecking precedes linting because project references emit the declarations consumed by typed E2E lint rules on a clean runner.
- Prettier and a YAML 1.2 parser validated the workflow locally; GitHub will provide the final semantic validation on the first pushed run.
