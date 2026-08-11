# 1406: Compile owned schema transformations and provenance

- Status: planned
- Milestone: 14
- Packages: `@ultimabase/core`
- Depends on: 1405
- ADR: ADR-0187, ADR-0191, ADR-0192

## Goal

Let authorized plugins add or immutably transform application schemas and fields
while retaining deterministic ownership, conflicts, identities, and persisted
provenance.

## Acceptance criteria

- [ ] Plugins can add stable schemas and use immutable patches for ordinary fields, relations, option values, indexes, portable constraints, extensions, generated identities, validation, handles, and plugin-owned physical metadata.
- [ ] Selectors observe the graph completed by earlier plugins, freeze their targets before the current plugin's patches, and cannot self-expand from a preceding patch in the same callback.
- [ ] Cross-owner changes require `schema:transform` and an explicit target owner; additions need only the narrower declaration or extension privilege.
- [ ] Core identity fields and schema class names reject ordinary transform, rename, and removal; `schema:replace` must replace the complete compatible compiler capability rather than bypass minimum Core protocols.
- [ ] Schema renames use a new schema plus explicit migration metadata and are never inferred from remove-and-add pairs.
- [ ] Option namespaces provide JavaScript validation, normalization, immutable snapshots, Typegen descriptors, capability requirements, and optional Runtime compilation.
- [ ] Duplicate additions, removed dependencies, stale owner or shape expectations, selector instability, built-in collisions, and ambiguous cross-owner changes fail without last-writer-wins behavior.
- [ ] The final schema snapshot explains every schema, field, option, index, generated identity, patch, plugin owner, and plugin version.
- [ ] Persisted metadata includes plugin and instance identity, package and protocol versions, stable contribution identity, and normalized static options.
- [ ] Explicit upgrade steps require `migration:contribute`, and upgrade or orphaned-removal metadata reaches later migration planning; no removal, version change, or synchronization drops data automatically.
- [ ] Schema examples document plugin additions, transforms, conflicts, and application isolation.

## Tests

- [ ] Runtime tests cover every patch kind, selector snapshots, protected invariants, replacement, upgrades, orphaned removal, ordering, conflicts, provenance, stable repeat compilation, circular targets, and incompatible reuse of one schema class.
- [ ] Type tests cover option and field contribution contracts without claiming final generated types before issue 1408.

## Out of scope

- Dynamic schema handles, model methods, and plugin operations; issue 1407 owns them.
- Executing physical migrations.
