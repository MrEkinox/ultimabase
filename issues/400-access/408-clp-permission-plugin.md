# 408: Implement clpPermissionPlugin

- Status: planned
- Milestone: 4
- Packages: `@ultimabase/clp-permissions`
- Depends on: 210, 328, 337, 406, 407
- ADR: ADR-0006, ADR-0089, ADR-0090

## Goal

Enforce global defaults and per-schema CLP through native schema hook guards.

## Acceptance criteria

- [ ] Schema rules override the matching global operation default.
- [ ] Role rules require role services only when used.
- [ ] ACL cannot override a CLP denial.
- [ ] CLP installs deny-only operation guards through schema-extension or global hook targets.
- [ ] Runtime receives no CLP configuration, stage name, neutral handler, or master-bypass decision.

## Tests

- [ ] Anonymous, user, role, and master matrices.
