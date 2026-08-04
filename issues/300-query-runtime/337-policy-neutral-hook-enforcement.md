# 337: Replace named permission stages with hook enforcement

- Status: done
- Milestone: 3
- Packages: `@ultimabase/core`, `@ultimabase/postgres-plugin`
- Depends on: 328, 330
- ADR: ADR-0064, ADR-0076, ADR-0089, ADR-0090, ADR-0102

## Goal

Remove CLP, ACL, and field-permission knowledge from Runtime and replace their
named pipeline positions with generic, monotonic hook effects available to any
plugin.

## Acceptance criteria

- [x] Runtime public and internal stage discriminants no longer contain `clp`, `acl`, or `fieldPermissions`.
- [x] Application assembly no longer installs neutral permission handlers or grants exclusive ownership of named permission positions.
- [x] Neutral `guard` contributions may reject but cannot grant or replace request authority.
- [x] Neutral `constraint` contributions are opaque namespaced nodes accumulated with logical `AND` outside the transformable Operation AST.
- [x] Permission-specific `DatabaseAccessConstraintNode` and `accessConstraints` names become policy-neutral without weakening adapter type inference.
- [x] Neutral `restrictInput`, `restrictSelection`, and `restrictOutput` contributions compose by intersection and cannot broaden a previous restriction.
- [x] Later native or plugin hooks cannot clear, replace, or inspect another plugin's private enforcement payload.
- [x] Value-derived guards and constraints are reevaluated monotonically after business operation transforms so no decision becomes stale.
- [x] Guards, adapter constraints, and input or selection restrictions run before effectful business hooks, so denied operations cannot trigger business writes.
- [x] Output restrictions run after every result transform and immediately before the result crosses Runtime's enforcement boundary.
- [x] Runtime transports `anonymous`, `user`, and `master` authority without deciding which policy hooks master bypasses.
- [x] Neutral request-authority types may remain in `@ultimabase/core`; no new package is created merely to relocate them.
- [x] An application with no policy plugin registers no policy hooks and executes without neutral permission placeholders.
- [x] A declared schema or field extension still requires its owning plugin handler during Core setup.
- [x] Runtime forwards opaque constraints to the selected adapter without compiling or interpreting their policy payload.
- [x] Public names and documentation remain policy-neutral so a community tenant or soft-delete plugin receives the same guarantees.

## Tests

- [x] Runtime tests cover deny-only guards, constraint accumulation, post-transform reevaluation, every mutation input shape, field-set intersection, final output restriction, invalid effects, and non-removable enforcement state.
- [x] Assembly tests cover no-policy applications, multiple independent policy plugins, deterministic diagnostics, and missing extension handlers.
- [x] Compile-time tests remove named permission stage completions and preserve exact schema, operation, and field types for generic enforcement hooks.
- [x] Dependency checks prove Runtime imports no concrete permission plugin.

## Out of scope

- Implementing CLP, ACL, roles, or field-permission behavior.
- Giving Runtime knowledge of a community policy's configuration or constraint payload.
