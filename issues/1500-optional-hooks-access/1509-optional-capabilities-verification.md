# 1509: Verify optional official capability extraction

- Status: completed
- Milestone: 15
- Packages: repository-wide
- Depends on: 1508
- ADR: ADR-0186, ADR-0187, ADR-0188, ADR-0189, ADR-0190, ADR-0191, ADR-0192, ADR-0193, ADR-0194, ADR-0202, ADR-0204, ADR-0205

## Goal

Complete the cross-milestone proof that Hooks and Access are ordinary optional
plugins built on the trusted open kernel.

## Acceptance criteria

- [x] Every milestone 15 issue and dependency is complete with one current public contract documented across Core, Typegen, plugin-kit, testing, and official plugins.
- [x] No-Hooks, alternative-Hooks, official-Hooks, no-Access, alternative-Access, official-Access, ACL, Roles, PostgreSQL, and JavaScript matrices pass through built public exports.
- [x] Master stays Core-owned, audited, unavailable to transports, and non-inheritable through privileges or capabilities.
- [x] Official plugins request and report exact privileges, use public plugin-kit helpers, and pass the public conformance harness without private imports.
- [x] Core pays no product-specific setup or request cost when Hooks or Access is absent.
- [x] ADR indexes, roadmap, architecture, package maps, examples, milestone status, and paused ACL/Typegen resume points are reconciled.
- [x] The active plan is archived only after all validation evidence is recorded.

## Tests

- [x] Repository unit/type tests, coverage, typecheck, lint, formatting, constraints, build, package archives, and complete PostgreSQL E2E pass.
- [x] Public API, dependency, generated artifact, performance, and removal audits find no native Hooks or Access leak in Core.

## Verification record

- `official-capability-conformance.e2e.test.ts` runs both official verticals
  through `@ultimabase/testing`, protects their exact privilege order, and
  verifies deterministic installed-only Typegen contracts through public
  package exports.
- The no-engine, independent-alternative, official-engine, ACL, Roles,
  JavaScript, packed, and PostgreSQL proofs pass. Core Master remains covered
  across no, official, and alternative policy engines plus anonymous-only
  transport boundaries and non-inheritable plugin privileges.
- Source-backed E2E coverage now reuses the existing public behavior and
  PostgreSQL matrices instead of excluding the extracted plugin Runtime. The
  unchanged thresholds pass at 88.32% statements, 80.85% branches, 93.74%
  functions, and 88.45% lines.
- Core source, declaration, dependency, generated-output, and deep-import
  searches find no official product dependency or removed contract package.
  Focused tests confirm that an empty graph allocates no behavior bundle,
  enforcement stages, or neutral Runtime contribution.

## Commands passed

- `yarn constraints`, `yarn format:check`, `yarn typecheck`, `yarn lint`, and
  `yarn build` including attw and publint.
- `yarn test`: 334 files and 1,812 unit/type tests.
- `yarn test:coverage`: 374 files and 1,935 tests, including source-backed
  PostgreSQL coverage.
- `yarn test:pack`: 13 files and 70 packed-consumption tests.
- `yarn test:e2e`: 41 files and 167 built public-export and PostgreSQL tests.

## Out of scope

- Resuming the paused ACL hardening or Typegen performance plans.
- Sandbox, marketplace, hot reload, or plugin privilege lockfile work.
