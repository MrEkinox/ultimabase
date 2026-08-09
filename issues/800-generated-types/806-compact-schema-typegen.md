# 806: Generate compact application schema types

- Status: planned
- Milestone: 8
- Packages: future codegen package, `@ultimabase/core`
- Depends on: 805
- ADR: [ADR-0173](../../docs/adr/0173-generated-schema-authoring.md)

## Goal

Generate one deterministic application registry of compact named TypeScript
contracts from the fully resolved static schema and plugin declaration graph.

## Acceptance criteria

- [ ] The generator emits model, create, update, where, select, order, include, object-path, pointer-target, relation-target, Access, hook, and FieldBuilder method contracts needed by current public APIs.
- [ ] Generated declarations reference shared operator contracts instead of expanding identical recursive conditional types per schema.
- [ ] Enum values, list depth, required/defaulted/immutable state, nested objects, pointer and relation targets, and plugin logical values remain exact.
- [ ] Output ordering, formatting, identifiers, and content hashes are deterministic across equivalent runs.
- [ ] The generator reports schema-name, generated-identity, output-path, and plugin-contribution conflicts with owner information.
- [ ] Application configuration and schema sources can be loaded through transpilation before the generated registry exists.
- [ ] Atomic output replacement prevents readers from observing partial files.
- [ ] Generated files contain no secrets, adapters, executable hooks, Access callbacks, request state, or physical database metadata.
- [ ] The public generated facade uses no `any` and keeps hovers concise.

## Tests

- [ ] Snapshot and semantic tests cover deterministic output, stale hashes, nested and circular schemas, plugin methods, collisions, and malformed contributions.
- [ ] A generated fixture typechecks with the supported stable TypeScript compiler before it is connected to production APIs.
