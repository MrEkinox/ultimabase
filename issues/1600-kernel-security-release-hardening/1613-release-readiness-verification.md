# 1613: Run the milestone 16 release-readiness gate

- Status: completed
- Milestone: 16
- Packages: repository-wide
- Depends on: 1602, 1603, 1604, 1605, 1606, 1607, 1608, 1609, 1610, 1611, 1612
- ADR: ADR-0191, ADR-0202, ADR-0204, ADR-0205, ADR-0206

## Goal

Verify that the milestone 14 kernel and milestone 15 optional products satisfy
their corrected security, policy, documentation, conformance, and cost claims
through public source and built package boundaries.

## Acceptance criteria

- [x] A fresh audit confirms Core has no concrete Hooks, Access, ACL, Roles, database, transport, or plugin-kit dependency.
- [x] Master contexts cannot cross application or authority provenance boundaries, and every legitimate elevation is audited by the owning application authority.
- [x] Every retained privilege is enforceable at its named Core boundary and every official direct environmental effect is claimed.
- [x] No active documentation or executable example uses superseded native Hooks, native Access, inactive privileges, or obsolete authoring signatures.
- [x] Hooks and Access meet their dedicated security coverage and behavior-conformance gates.
- [x] The no-product configuration proves absence of product-specific stages and remains compatible with JavaScript, TypeScript, Typegen-free, packed, and PostgreSQL applications.
- [x] Public exports, plugin instances, capability ownership, lifecycle cleanup, application isolation, alternative engines, ACL independence, and built-package contracts remain intact.
- [x] The milestone README records exact evidence, commands, coverage results, measured cost, and any deliberately deferred non-blocking work.

## Tests

- [x] `yarn constraints`, `yarn typecheck`, `yarn test`, `yarn test:coverage`, `yarn lint`, `yarn format:check`, and `yarn build` pass.
- [x] Public E2E, PostgreSQL Testcontainers, package archive, source language-service, packed language-service, metadata, documentation, and performance gates pass.
- [x] The final audit runs from a clean checkout using only public package exports where applicable.

## Completion evidence

- Core's manifest contains only `@ultimabase/shared`, `semver`, and `uuid`; the
  production import audit and repository constraints found no concrete-product,
  infrastructure, `plugin-kit`, or cross-package deep import.
- The complete Master provenance, exact callback-owner privilege, official
  environment-claim, public transport, alternative-engine, ACL independence,
  lifecycle, instance, and application-isolation matrices pass through source
  and built public exports.
- The no-product probe records one canonical Runtime assembly and zero optional
  behavior bundles, enforcement bundles, stages, or request calls. Its control
  case detects one inserted neutral behavior stage and two calls.
- The final package archive and built E2E gate ran from clean commit `f0e77cd`;
  the issue record was updated only after that gate passed.

## Validation

- `yarn constraints`
- active documentation and backlog metadata: 2 files, 14 tests
- `yarn test:performance`: 1 file, 2 tests
- `yarn typecheck`
- `yarn test`: 349 files, 1,887 tests
- `yarn test:coverage`: 393 files, 2,024 tests, no type errors
- global coverage: 88.75% statements, 81.47% branches, 93.80% functions,
  88.89% lines
- Access coverage: 83.58% statements, 71.69% branches, 88.95% functions,
  83.14% lines
- Hooks coverage: 90.05% statements, 81.38% branches, 94.89% functions,
  90.41% lines
- `yarn build` with clean `attw` and `publint` results
- `yarn test:pack:built`: 17 files, 85 tests
- `yarn test:e2e:built`: 45 files, 182 tests, including PostgreSQL
  Testcontainers on Docker 29.7.2
- `yarn lint`: 0 errors and 76 existing centralized file-size warnings
- `yarn format:check`

## Out of scope

- Adding a new product capability or publishable package.
- Resuming paused ACL issue 432 or generated-schema DX issue 810.
- Declaring the first usable release complete before the transport milestones are implemented.
