# 417: Compile Access plans and plugin contributions

- Status: completed
- Milestone: 4
- Packages: `@ultimabase/core`
- Depends on: 328, 401, 416, 421
- ADR: ADR-0097, ADR-0102, ADR-0116

## Goal

Compile native declarations and plugin-provided policies into one immutable,
application-owned `AccessPlan` for each schema.

## Acceptance criteria

- [x] Application setup compiles schema and field declarations once without creating per-request placeholder handlers.
- [x] Shared schema read rules and explicit `one`, `many`, `count`, and `exists` branches compile to the same normalized operation decisions without per-request public-shape branching.
- [x] Shared field read rules and explicit `item`, `filter`, and `order` branches compile to the same internal field capabilities without losing their disclosure channel.
- [x] Plugins contribute Access rules through an owner-scoped registry rather than installing permission behavior as arbitrary business hooks.
- [x] Contributions may target all schemas, one exact schema, one exact field path, a schema extension, a field extension, or a field kind.
- [x] Developer declarations and plugin contributions preserve dependency-first plugin order, configuration position, registration order, and readable provenance diagnostics.
- [x] Operation decisions compose by deny, filters by logical `AND`, and field sets by intersection; contribution order can never broaden access.
- [x] The application exposes a configurable global default policy for undeclared operation and field decisions.
- [x] Each contribution explicitly defines whether audited master authority bypasses that contribution; Core does not apply one permission-plugin-specific bypass table.
- [x] Missing context values remain callback-owned runtime decisions; the optional static service requirement contract is isolated in issue 420 before concrete providers depend on it.
- [x] Applications remain isolated and duplicate or forged contributions fail deterministically before connect.

## Tests

- [x] Compilation tests cover native-only, plugin-only, mixed, absent, global-default, master, duplicate, forged, and application-isolation plans.
- [x] Type tests prove exact schema and field targeting for plugin contributors.
- [x] Diagnostic tests preserve plugin owner, target, rule level, and operation family without exposing private filter payloads.

## Implementation notes

- The compiled plan retains ordered rule references rather than evaluating or
  reducing callbacks during setup. Issue 418 performs deny-only evaluation,
  filter `AND`, and field intersection inside the request lifecycle.
- Optional subject values and statically required resolver services remain the
  dedicated scope of issue 420; this compiler neither invents a User concept
  nor eagerly resolves capabilities unused by a contribution.

## Out of scope

- Executing an Access plan.
- Concrete CLP, ACL, role, authentication, tenancy, or soft-delete policies.
