# 3019: Simplify the ACL Permissions plugin

- Status: planned
- Milestone: 30
- Packages: `@ultimabase/acl-permissions-plugin`
- Depends on: 3018
- ADR: retained ACL and protected-policy decisions; new ADR only if the stop protocol approves a boundary change

## Goal

Simplify ACL compilation, storage constraints, and enforcement while preserving
its independent monotonic policy and generic Core boundary.

## Acceptance criteria

- [ ] Baseline ACL field declaration, codecs, policy compilation, adapter
      constraints, subject matching, maintenance, exports, and tests.
- [ ] Remove duplicate schema traversal, normalization, query shaping, command
      mapping, and transport facts replaced by retained kernel projections.
- [ ] Preserve owner, role, and public grants, AND-only row filtering,
      operation and field restrictions, nested writes, relations, maintenance,
      wire codecs, Master behavior, and composition with or without Access.
- [ ] Keep ACL independent from `@ultimabase/access-plugin`; Core and Access
      must not acquire ACL vocabulary or configuration.
- [ ] Change no public behavior, configuration, export, or error without an
      architecture stop and explicit user approval.
- [ ] Review the affected ACL pages under `apps/website/content/docs` and, when
      required, update them and the package README in the same audited issue.

## Tests

- [ ] Source and packed types, JavaScript, policy monotonicity, subjects, Roles,
      nested writes, relations, REST, GraphQL, Master, and PostgreSQL suites pass
      with unchanged coverage evidence.

## Audit gate

- [ ] Audit for policy broadening, Access coupling, constraint loss, product
      vocabulary in Core, duplicate paths, and stale codecs. Correct and repeat
      until green.
- [ ] Record package metrics, contract-matrix reconciliation, and Documentation
      impact before completion.

## Out of scope

- Resuming the paused ACL feature backlog or adding new grants.
