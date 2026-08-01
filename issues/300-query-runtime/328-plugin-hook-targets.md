# 328: Add typed plugin hook targets

- Status: planned
- Milestone: 3
- Packages: `@ultimabase/core`, `@ultimabase/runtime`, `@ultimabase/schema`
- Depends on: 207, 318, 327
- ADR: ADR-0048, ADR-0070, ADR-0089

## Goal

Let every plugin contribute hooks to global, schema, or field scopes through
the fundamental application-owned dispatcher.

## Acceptance criteria

- [ ] Plugin setup can target all schemas, one exact schema, or one exact typed field path.
- [ ] Plugins can target schema extensions, field extensions, and namespaced field kinds without manually enumerating declarations.
- [ ] Typed path segments support nested object fields and infer the terminal logical value.
- [ ] Contributions record the setup owner and a stable plugin-local identity automatically.
- [ ] Duplicate identities, foreign schemas, invalid paths, incompatible field kinds, and late registration fail during application initialization.
- [ ] Plugin hooks append to rather than replace developer hooks.
- [ ] Ordering uses plugin dependencies, configuration position, and registration order without numeric priorities.
- [ ] Application instances retain isolated immutable contribution snapshots.
- [ ] Permission plugins continue to use reserved security stages rather than ordinary hooks.

## Tests

- [ ] Runtime tests cover every target kind, conflicts, invalid targets, and application isolation.
- [ ] Compile-time tests cover schema identity, nested paths, custom fields, and handler inference.
- [ ] Ordering tests cover dependencies, configuration position, and multiple registrations.

## Out of scope

- Implementing CLP, ACL, or field permissions as business hooks.
