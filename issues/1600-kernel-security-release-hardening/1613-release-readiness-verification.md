# 1613: Run the milestone 16 release-readiness gate

- Status: planned
- Milestone: 16
- Packages: repository-wide
- Depends on: 1602, 1603, 1604, 1605, 1606, 1607, 1608, 1609, 1610, 1611, 1612
- ADR: decision produced by 1601, ADR-0191, ADR-0202, ADR-0204, ADR-0205

## Goal

Verify that the milestone 14 kernel and milestone 15 optional products satisfy
their corrected security, policy, documentation, conformance, and cost claims
through public source and built package boundaries.

## Acceptance criteria

- [ ] A fresh audit confirms Core has no concrete Hooks, Access, ACL, Roles, database, transport, or plugin-kit dependency.
- [ ] Master contexts cannot cross application or authority provenance boundaries, and every legitimate elevation is audited by the owning application authority.
- [ ] Every retained privilege is enforceable at its named Core boundary and every official direct environmental effect is claimed.
- [ ] No active documentation or executable example uses superseded native Hooks, native Access, inactive privileges, or obsolete authoring signatures.
- [ ] Hooks and Access meet their dedicated security coverage and behavior-conformance gates.
- [ ] The no-product configuration proves absence of product-specific stages and remains compatible with JavaScript, TypeScript, Typegen-free, packed, and PostgreSQL applications.
- [ ] Public exports, plugin instances, capability ownership, lifecycle cleanup, application isolation, alternative engines, ACL independence, and built-package contracts remain intact.
- [ ] The milestone README records exact evidence, commands, coverage results, measured cost, and any deliberately deferred non-blocking work.

## Tests

- [ ] `yarn constraints`, `yarn typecheck`, `yarn test`, `yarn coverage`, `yarn lint`, `yarn format:check`, and `yarn build` pass.
- [ ] Public E2E, PostgreSQL Testcontainers, package archive, source language-service, packed language-service, metadata, documentation, and performance gates pass.
- [ ] The final audit runs from a clean checkout using only public package exports where applicable.

## Out of scope

- Adding a new product capability or publishable package.
- Resuming paused ACL issue 432 or generated-schema DX issue 810.
- Declaring the first usable release complete before the transport milestones are implemented.
