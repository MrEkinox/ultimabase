# 417: Compile Access plans and plugin contributions

- Status: planned
- Milestone: 4
- Packages: `@ultimabase/core`
- Depends on: 328, 401, 416, 421
- ADR: ADR-0097, ADR-0102, ADR-0116

## Goal

Compile native declarations and plugin-provided policies into one immutable,
application-owned `AccessPlan` for each schema.

## Acceptance criteria

- [ ] Application setup compiles schema and field declarations once without creating per-request placeholder handlers.
- [ ] Shared schema read rules and explicit `one`, `many`, `count`, and `exists` branches compile to the same normalized operation decisions without per-request public-shape branching.
- [ ] Shared field read rules and explicit `item`, `filter`, and `order` branches compile to the same internal field capabilities without losing their disclosure channel.
- [ ] Plugins contribute Access rules through an owner-scoped registry rather than installing permission behavior as arbitrary business hooks.
- [ ] Contributions may target all schemas, one exact schema, one exact field path, a schema extension, a field extension, or a field kind.
- [ ] Developer declarations and plugin contributions preserve dependency-first plugin order, configuration position, registration order, and readable provenance diagnostics.
- [ ] Operation decisions compose by deny, filters by logical `AND`, and field sets by intersection; contribution order can never broaden access.
- [ ] The application exposes a configurable global default policy for undeclared operation and field decisions.
- [ ] Each contribution explicitly defines whether audited master authority bypasses that contribution; Core does not apply one permission-plugin-specific bypass table.
- [ ] Missing context values or services fail only when a normalized contribution actually requires them and fail before infrastructure starts when the requirement is static.
- [ ] Applications remain isolated and duplicate or forged contributions fail deterministically before connect.

## Tests

- [ ] Compilation tests cover native-only, plugin-only, mixed, absent, global-default, master, duplicate, forged, and application-isolation plans.
- [ ] Type tests prove exact schema and field targeting for plugin contributors.
- [ ] Diagnostic tests preserve plugin owner, target, rule level, and operation family without exposing private filter payloads.

## Out of scope

- Executing an Access plan.
- Concrete CLP, ACL, role, authentication, tenancy, or soft-delete policies.
