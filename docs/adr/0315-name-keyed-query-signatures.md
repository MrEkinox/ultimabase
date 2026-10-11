# ADR-0315: Name-keyed query signatures

- Status: accepted
- Date: 2026-10-11
- Refines: ADR-0297 (form D, name-keyed types), ADR-0310 (named types); applies ADR-0288
- Approval: direction decided by the user on 2026-10-11 after Core migration step 5
  (`docs/handoff/migration-core.md`, step 5, option 2); record accepted by the user on 2026-10-11
- Evidence: `docs/handoff/migration-core-etape-5.md` (step 5 profile and ablations, `main`
  5fe975d6), `docs/handoff/formes/d-named.md` (variant `named-args`)

## Context

Step 5 measured the editor cost of Core's query methods on the form D benchmark: each schema's
`findMany` costs about 15 ms and 12 k instantiations even without arguments, and an ablation of
the query signatures bounds the gain at about −0.85 s of 2.6 s at 50 schemas (−32 %). The
arguments are typed through the structural contract of the schema (`TContract['inputs']…`), so
every call re-derives them, and `findMany` has two overloads: the schema input and an
already-built `QueryBuilder` input. A typo in `select` therefore reports "No overload matches this
call" with both overloads (1 539 characters). The `named-args` prototype typed the arguments by
the registered name (`FindManyArgs<"Todo">`) with one signature and printed
`'titel' does not exist in type 'Select<"Todo">'. Did you mean to write 'title'?` (133
characters). `Register` is required since step 4 (ADR-0297 amendment 1), so every application
schema has a registered name.

## Decision

1. **Arguments keyed by name.** The arguments of the schema methods (`findMany`, `findOne`,
   `findOneOrThrow`, `count`, `exists`, `createOne`, `createMany`, `updateOne`, `updateMany`,
   `upsertOne`, `upsertMany`, `deleteOne`, `deleteMany`) are typed by the registered schema name
   through exported aliases: `FindManyArgs<"Todo">`, `FindOneArgs<"Todo">`, `Where<"Todo">`,
   `Select<"Todo">`, `Include<"Todo">`, `OrderBy<"Todo">`, and the write arguments built on
   `CreateInput<"Todo">` and `UpdateInput<"Todo">` (ADR-0310). Each alias also accepts
   `typeof Todo` and prints the name-keyed form, like `Model<T>`.
2. **Results keyed by name.** A call without `select` or `include` returns `Model<"Todo">`; with
   them, the result is computed from the name-keyed arguments and prints its fields.
3. **One signature per method.** The `findMany` overload that executes an already-built
   `QueryBuilder` input is removed: it has no caller outside one internal test, and since
   ADR-0311 `QueryBuilder` is a plugin-author type. A plugin that needs to execute a built query
   gets that entry point through its own record.
4. **Behaviour unchanged.** Accepted inputs, exactness checks (`select`, `include`, `where`),
   runtime validation and results stay identical; only type names, printed hovers, diagnostic
   text and the overload count change.
5. **Schemas without a registered name** (old-form schemas registered through the step 4
   workaround, ADR-0297 step 4 section) keep the current structural types until migration step 6
   removes the old form.

## Consequences

- Hovers print `FindManyArgs<"Todo">`, `Select<"Todo">`, `Model<"Todo">`; the `select` typo
  diagnostic names `Select<"Todo">` and suggests the field.
- Tests: type tests for each alias with a name and with `typeof`, assignability of the aliases to
  the method arguments, the `select`, `include` and `where` typo messages (exact text, source and
  built packages), unchanged runtime behaviour; the DX audit reports every changed hover and the
  removed overload; the form D bench is measured before and after against ADR-0297's targets.
- Documentation impact: both (query reference and named types on the website, Core README).

## Out of scope

Plugin projection templates (step 6, with the plugin facade), removal of the old form and of
Typegen (step 6), the shape of query inputs themselves.
