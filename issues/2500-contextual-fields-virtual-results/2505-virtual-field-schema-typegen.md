# 2505: Compile virtual schema fields

- Status: planned
- Milestone: 25
- Packages: `@ultimabase/core`, `@ultimabase/typegen`
- Depends on: 2504
- ADR: proposed ADR-0244

## Goal

Add `field.virtual({ output, select, resolve })` to authoritative schema
declarations and generated public contracts without adding a stored field.

## Acceptance criteria

- [ ] The canonical FieldBuilder captures one immutable virtual declaration with
      output descriptor, flat dependency selection, documentation, provenance,
      and one Core-private resolver binding.
- [ ] Compilation validates dependency names, inclusion/exclusion shape,
      persisted-only targets, self/cycle prevention, output compatibility, and
      callback identity before infrastructure effects.
- [ ] Callback-free public compiler IR and deterministic schema fingerprints
      retain inert virtual metadata without exposing or serializing the resolver.
- [ ] Schema item, model result, complete result, and literal `select` types
      include virtual fields with the declared output value.
- [ ] Create, update, upsert, nested-write, where, orderBy, index, constraint,
      migration, and adapter field types exclude virtual fields.
- [ ] Generated resolver declarations provide exact selected `item`, real
      `RequestContext`, and value-or-Promise return typing while bootstrap
      JavaScript remains fully executable.
- [ ] Query normalization accepts virtual result selection and rejects virtual
      filtering, ordering, relationship inclusion, or dependency selection.
- [ ] Core README and schema examples document primitive, object, nullable, list,
      context-dependent, and asynchronous virtual declarations.

## Tests

- [ ] Runtime, type, Typegen, language-service, source-export, and compiled-export
      tests cover exact presence and deliberate absence across every operation.
- [ ] Application compilation tests cover stale Typegen, invalid dependencies,
      multiple applications, and schemas compiled without Typegen.

## Out of scope

- Executing resolvers, adapter projection changes, or transport exposure.
