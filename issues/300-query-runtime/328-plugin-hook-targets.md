# 328: Add typed plugin hook targets

- Status: completed
- Milestone: 3
- Packages: `@ultimabase/core`
- Depends on: 207, 318, 327
- ADR: ADR-0048, ADR-0070, ADR-0089, ADR-0090, ADR-0096, ADR-0097

## Goal

Let every plugin contribute hooks to global, schema, or field scopes through
the fundamental application-owned dispatcher.

## Acceptance criteria

- [x] `setup({ hooks })` exposes owner-bound `global`, `schema`, `field`, `schemaExtension`, `fieldExtension`, and `fieldKind` targets.
- [x] Exact schema and field targets retain schema identity, typed nested path segments, and the terminal logical field value.
- [x] `defineFieldKindHookTarget<TField>(kind)` creates a provenance-checked token for one typed namespaced community field kind.
- [x] Extension and field-kind factories execute once per deterministic initialization match and return native hook declarations.
- [x] Factory configuration can be closed over but is never injected into schema or field Runtime hook inputs.
- [x] Contributions record the setup owner automatically and use `(ownerPlugin, localName)` identity, allowing the same local name across different owners.
- [x] Same-owner duplicates, foreign schemas, invalid paths, foreign extensions, forged field-kind tokens, and late registration fail before infrastructure starts.
- [x] Resolved plugin declarations remain separate from developer declarations so issue 330 can append them without replacement.
- [x] Ordering uses plugin dependencies, configuration position, registration order, schema order, and deterministic nested-field traversal without numeric priorities.
- [x] Application instances retain isolated immutable contribution and target-match snapshots.
- [x] Target APIs contain no CLP, ACL, role, or field-permission discriminant.

## Tests

- [x] Runtime tests cover every target kind, owner-local conflicts, foreign targets, invalid paths, late registration, and application isolation.
- [x] Compile-time tests cover exact schema identity, nested paths, extension factories, custom field-kind tokens, and handler inference.
- [x] Ordering tests cover dependencies, configuration position, multiple registrations, schema order, and nested field traversal.

## Out of scope

- Implementing a concrete CLP, ACL, role, or field-permission policy.
- Executing resolved declarations, which belongs to issue 330.
