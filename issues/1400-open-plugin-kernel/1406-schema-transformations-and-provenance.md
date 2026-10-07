# 1406: Compile owned schema transformations and provenance

- Status: completed
- Milestone: 14
- Packages: `@ultimabase/core`
- Depends on: 1405
- ADR: ADR-0187, ADR-0191, ADR-0192

## Goal

Let authorized plugins add or immutably transform application schemas and fields
while retaining deterministic ownership, conflicts, identities, and persisted
provenance.

## Approved bounded interpretation

This issue owns the logical static schema graph without absorbing the later
application-handle, Typegen-rendering, or adapter-migration bridges:

- plugins may add stable `Schema.define()` classes and contribute immutable
  logical patches for fields, relationships, option values, indexes, portable
  constraints, validation metadata, extensions, and generated identities;
- selectors resolve once per plugin against the graph completed by earlier
  owners, and every contribution retains exact plugin and instance identity,
  package version, stable contribution identity, and normalized static options;
- the final logical snapshot exposes inert provenance and future migration
  declarations, but Core does not compare persisted historical snapshots or
  compile physical migration work in this issue;
- application schema and model handles remain owned by issue 1407;
- complete schema-compiler replacement and the `schema:replace` capability
  protocol remain owned by issue 1418;
- rendering or executing Typegen descriptors remains owned by issue 1408;
- physical schema metadata, adapter bridges, prior-snapshot comparison, upgrade
  planning, and orphaned-removal handling remain owned by issue 1417.

In the acceptance criteria below, handles, Typegen descriptors, physical
metadata, upgrades, and orphaned removals mean that the logical snapshot keeps
the ownership and inert declaration facts needed by those later issues. Their
public execution, rendering, adapter integration, and historical comparison are
not delivered here.

Plugin option namespaces extend the ordinary direct schema and field option
objects rather than introducing a separate `pluginOptions` bag. Module-level
schema and field declarations preserve unknown root options as unresolved static
input. During application compilation, Core resolves each unknown key against
the option descriptors declared by installed plugins: one exact owner validates,
normalizes, and immutably snapshots the value; no owner retains the current
unknown-option failure; multiple owners are a deterministic conflict. Known
Core options and their nested contracts keep their immediate validation. An
installed but unused option descriptor has no effect. Issue 1408 later supplies
the TypeScript augmentation and autocomplete for these same direct properties;
Runtime validation in Core never depends on Typegen.

## Acceptance criteria

- [x] Plugins can add stable schemas and use immutable logical patches for ordinary fields, relationships, option values, indexes, portable constraints, extensions, stable contribution identities, and plugin-owned validation or future physical facts represented by declared option and constraint protocols; handles and physical compilation remain owned by issues 1407 and 1417.
- [x] Selectors observe the graph completed by earlier plugins, freeze their targets before the current plugin's patches, and cannot self-expand from a preceding patch in the same callback.
- [x] Cross-owner changes require `schema:transform` and an explicit target owner; additions need only the narrower declaration or extension privilege.
- [x] Core identity fields and schema class names reject ordinary transform, rename, and removal; no partial compiler replacement or placeholder escape hatch is added before issue 1418 delivers the complete compatible `schema:replace` capability.
- [x] Schema class names have no ordinary rename operation; a future rename is represented by a new schema plus explicit migration intent in issue 1417 and is never inferred from remove-and-add pairs.
- [x] Option namespaces provide JavaScript validation, normalization, immutable snapshots, Typegen descriptors, capability requirements, and optional Runtime compilation.
- [x] Duplicate additions, removed dependencies, stale owner or shape expectations, selector instability, built-in collisions, and ambiguous cross-owner changes fail without last-writer-wins behavior.
- [x] The final schema snapshot explains every schema, field, option, index, constraint, extension, stable contribution identity, patch, plugin owner, and plugin version.
- [x] Persisted metadata includes plugin and instance identity, package and protocol versions, stable contribution identity, and normalized static options.
- [x] The final inert provenance retains every owner, version, protocol, contribution identity, and normalized static option needed by issue 1417; removing or changing a plugin never authorizes Core to drop data automatically.
- [x] Schema examples document plugin additions, transforms, conflicts, and application isolation.

## Tests

- [x] Runtime tests cover every patch kind, selector snapshots, protected invariants, field/index/constraint/extension replacement, ordering, conflicts, provenance, stable repeat compilation, circular targets, incompatible reuse of one schema class, and the absence of automatic destructive removal.
- [x] Type tests cover option and field contribution contracts without claiming final generated types before issue 1408.

## Out of scope

- Dynamic schema handles, model methods, and plugin operations; issue 1407 owns them.
- Complete schema-compiler replacement; issue 1418 owns the versioned
  `schema:replace` capability.
- Executing physical migrations.
