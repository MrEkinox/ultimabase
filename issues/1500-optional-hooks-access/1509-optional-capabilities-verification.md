# 1509: Verify optional official capability extraction

- Status: planned
- Milestone: 15
- Packages: repository-wide
- Depends on: 1508
- ADR: ADR-0186, ADR-0187, ADR-0188, ADR-0189, ADR-0190, ADR-0191, ADR-0192, ADR-0193, ADR-0194

## Goal

Complete the cross-milestone proof that Hooks and Access are ordinary optional
plugins built on the trusted open kernel.

## Acceptance criteria

- [ ] Every milestone 15 issue and dependency is complete with one current public contract documented across Core, Typegen, plugin-kit, testing, and official plugins.
- [ ] No-Hooks, alternative-Hooks, official-Hooks, no-Access, alternative-Access, official-Access, ACL, Roles, PostgreSQL, and JavaScript matrices pass through built public exports.
- [ ] Master stays Core-owned, audited, unavailable to transports, and non-inheritable through privileges or capabilities.
- [ ] Official plugins request and report exact privileges, use public plugin-kit helpers, and pass the public conformance harness without private imports.
- [ ] Core pays no product-specific setup or request cost when Hooks or Access is absent.
- [ ] ADR indexes, roadmap, architecture, package maps, examples, milestone status, and paused ACL/Typegen resume points are reconciled.
- [ ] The active plan is archived only after all validation evidence is recorded.

## Tests

- [ ] Repository unit/type tests, coverage, typecheck, lint, formatting, constraints, build, package archives, and complete PostgreSQL E2E pass.
- [ ] Public API, dependency, generated artifact, performance, and removal audits find no native Hooks or Access leak in Core.

## Out of scope

- Resuming the paused ACL hardening or Typegen performance plans.
- Sandbox, marketplace, hot reload, or plugin privilege lockfile work.
