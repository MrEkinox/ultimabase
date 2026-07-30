# 006: Add GitHub Actions CI

- Status: planned
- Milestone: 0
- Packages: repository
- Depends on: 001, 002, 003, 004, 005
- ADR: ADR-0011, ADR-0012

## Goal

Run install, format, lint, typecheck, unit tests, integration tests, and build on GitHub.

## Acceptance criteria

- [ ] CI uses Node 24 and immutable Yarn installs.
- [ ] PostgreSQL integration jobs have Docker access.
- [ ] Jobs cache safe Yarn artifacts.
- [ ] Concurrency cancels obsolete branch runs.

## Tests

- [ ] Validate workflow syntax.
- [ ] Record the first successful workflow run.
