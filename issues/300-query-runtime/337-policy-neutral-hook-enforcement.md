# 337: Replace named permission stages with hook enforcement

- Status: planned
- Milestone: 3
- Packages: `@ultimabase/runtime`, `@ultimabase/core`, `@ultimabase/access`
- Depends on: 328, 330
- ADR: ADR-0064, ADR-0076, ADR-0089, ADR-0090

## Goal

Remove CLP, ACL, and field-permission knowledge from Runtime and replace their
named pipeline positions with generic, monotonic hook effects available to any
plugin.

## Acceptance criteria

- [ ] Runtime public and internal stage discriminants no longer contain `clp`, `acl`, or `fieldPermissions`.
- [ ] Application assembly no longer installs neutral permission handlers or grants exclusive ownership of named permission positions.
- [ ] Generic hook guards may reject but cannot grant or replace request authority.
- [ ] Generic adapter constraints are opaque namespaced nodes accumulated with logical `AND` outside the transformable Operation AST.
- [ ] Permission-specific `DatabaseAccessConstraintNode` and `accessConstraints` names become policy-neutral without weakening adapter type inference.
- [ ] Generic input, selection, and output restrictions compose by intersection and cannot broaden a previous restriction.
- [ ] Later native or plugin hooks cannot clear, replace, or inspect another plugin's private enforcement payload.
- [ ] Runtime transports `anonymous`, `user`, and `master` authority without deciding which policy hooks master bypasses.
- [ ] Neutral request-authority types may remain in `@ultimabase/access`; no new package is created merely to relocate them.
- [ ] An application with no policy plugin registers no policy hooks and executes without neutral permission placeholders.
- [ ] A declared schema or field extension still requires its owning plugin handler during Core setup.
- [ ] Database adapters reject constraint kinds for which no compiler is registered.
- [ ] Public names and documentation remain policy-neutral so a community tenant or soft-delete plugin receives the same guarantees.

## Tests

- [ ] Runtime tests cover deny-only guards, constraint accumulation, field-set intersection, invalid effects, and non-removable enforcement state.
- [ ] Assembly tests cover no-policy applications, multiple independent policy plugins, deterministic diagnostics, and missing extension handlers.
- [ ] Compile-time tests remove named permission stage completions and preserve exact schema, operation, and field types for generic enforcement hooks.
- [ ] Dependency checks prove Runtime imports no concrete permission plugin.

## Out of scope

- Implementing CLP, ACL, roles, or field-permission behavior.
- Giving Runtime knowledge of a community policy's configuration or constraint payload.
