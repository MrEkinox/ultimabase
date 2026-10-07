# 2505: Compile virtual schema fields

- Status: completed
- Milestone: 25
- Packages: `@ultimabase/core`, `@ultimabase/typegen`
- Depends on: 2504
- ADR: [ADR-0244](../../docs/adr/0244-contextual-fields-and-virtual-results.md)

## Goal

Add `field.virtual({ output, select, resolve })` to authoritative schema
declarations and generated public contracts without adding a stored field.

## Acceptance criteria

- [x] The canonical FieldBuilder captures one immutable virtual declaration with
      output descriptor, flat dependency selection, documentation, provenance,
      and one Core-private resolver binding.
- [x] Compilation validates dependency names, inclusion/exclusion shape,
      persisted-only targets, self/cycle prevention, output compatibility, and
      callback identity before infrastructure effects.
- [x] Callback-free public compiler IR and deterministic schema fingerprints
      retain inert virtual metadata without exposing or serializing the resolver.
- [x] The generated contract separates persisted `SchemaItem` from public
      `SchemaOutput`; model results, complete results, and literal `select`
      include virtual fields with the declared output value.
- [x] Create, update, upsert, nested-write, where, orderBy, index, constraint,
      migration, and adapter field types exclude virtual fields.
- [x] Generated resolver declarations provide exact selected `item`, real
      `RequestContext`, and value-or-Promise return typing while bootstrap
      JavaScript remains fully executable.
- [x] Query normalization accepts virtual result selection and rejects virtual
      filtering, ordering, relationship inclusion, or dependency selection.
- [x] Core README and schema examples document primitive, object, nullable, list,
      context-dependent, and asynchronous virtual declarations.

## Tests

- [x] Runtime, type, Typegen, language-service, source-export, and compiled-export
      tests cover exact presence and deliberate absence across every operation.
- [x] Application compilation tests cover stale Typegen, invalid dependencies,
      multiple applications, and schemas compiled without Typegen.

## Completion evidence

- `yarn typecheck`, `yarn format:check`, `yarn constraints`,
  `yarn check:issues`, and `git diff --check` passed.
- `yarn lint` passed with only the repository's existing file-size warnings;
  the reviewed `definition.ts` baseline decreased from 882 to 851 lines.
- `yarn test` passed 455 files, 2,189 runtime tests, and 183 type tests with
  listener-backed suites run with local-port access.
- `yarn build` passed for every workspace, including `attw` and `publint`.
- `yarn test:pack:built` passed 26 files and 150 tests after regenerating the
  committed Minimal and Todo Typegen declarations.

## Out of scope

- Executing resolvers, adapter projection changes, or transport exposure.
