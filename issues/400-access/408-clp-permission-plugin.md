# 408: Implement clpPermissionPlugin

- Status: planned
- Milestone: 4
- Packages: `@ultimabase/clp-permissions`
- Depends on: 210, 312, 330, 406, 407
- ADR: ADR-0006, ADR-0089

## Goal

Enforce global defaults and per-schema CLP in the Runtime pipeline.

## Acceptance criteria

- [ ] Schema rules override the matching global operation default.
- [ ] Role rules require role services only when used.
- [ ] ACL cannot override a CLP denial.
- [ ] CLP remains a reserved security stage and cannot be replaced or bypassed by a business hook.

## Tests

- [ ] Anonymous, user, role, and master matrices.
