# 338: Add the adapter constraint compiler registry

- Status: planned
- Milestone: 3
- Packages: `@ultimabase/core`, `@ultimabase/postgres`
- Depends on: 337, 507
- ADR: ADR-0063, ADR-0090

## Goal

Let database adapters compile opaque policy constraints through an
application-owned, namespaced registry without teaching Runtime their meaning.

## Acceptance criteria

- [ ] A plugin can register a constraint compiler for one namespaced kind and explicit payload version.
- [ ] Compiler ownership is derived from the plugin-scoped setup registry rather than trusted plugin input.
- [ ] Duplicate registrations for the same kind and version fail during setup with deterministic owner diagnostics.
- [ ] PostgreSQL combines every compiled constraint with the query predicate using logical `AND` and parameterized SQL.
- [ ] Missing kinds, unsupported versions, malformed compiler output, and invalid payloads fail closed before database execution.
- [ ] Runtime transports constraints without importing PostgreSQL or interpreting a policy payload.
- [ ] The registry is application-isolated and exposes concise autocomplete and hover documentation.

## Tests

- [ ] Registry tests cover ownership, duplicates, application isolation, version mismatches, and missing compilers.
- [ ] PostgreSQL adapter tests cover exact SQL parameters, logical `AND` composition, malformed output, and fail-closed unknown kinds.
- [ ] Compile-time tests preserve exact constraint payload types for the registering plugin without exposing them through Runtime's generic execution API.

## Out of scope

- Implementing CLP, ACL, roles, field permissions, tenancy, or soft deletion.
- Defining a policy-specific constraint payload.
