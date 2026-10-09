# ADR-0307: Prisma-aligned equality filters, atomic updates and required reads

- Status: proposed
- Date: 2026-10-09
- Supersedes, once accepted: ADR-0134 where it defines the `increment`, `decrement` and `unset`
  factories; the `get` read of ADR-0152 and ADR-0067; ADR-0182 (top-level `id` target alias)
- Refines: ADR-0143 (canonical object `where`), ADR-0160 (pointer identity operands); applies
  ADR-0288
- Approval: decided by the user on 2026-10-09 (`docs/handoff/api-ideale-decisions.md`, principle
  and decision 5; `docs/handoff/revue-plugins/core.md`, decisions 2 and 3; transversal rule of
  `docs/handoff/revue-plugins/README.md`); awaiting validation of this record

## Context

Queries and writes follow Prisma's vocabulary, and every divergence is justified. Today equality
needs an operator object (`where: { completed: { eq: false } }`,
`packages/core/src/query/filters/where-normalize.ts`), atomic updates need imported factories
(`increment`, `decrement`, `unset` in `packages/core/src/query/updates/operators.ts`, exported from
`packages/core/src/query/index.ts`), and a required read is `get({ id })`
(`packages/core/src/schema/schema/schema-api.ts`) beside `findOne`, which returns `null`.

## Decision

1. **Equality shorthand.** In every `where` input (schema reads and mutations, relation `where`,
   Access rule objects, REST `where` JSON, partial-index `where` of ADR-0303), a value that is
   not a plain object on a non-list scalar, enum or pointer field means `eq`: `where: { id }`,
   `where: { completed: false }`. On a pointer field the value is a target identifier or a
   `Pointer` of the declared target (`where: { author: principal }`); another schema's `Pointer`
   is a type error and a `VALIDATION_ERROR`. `null` means `isNull: true`, as in Prisma. List,
   `json`, `object`, relation and plugin fields keep explicit operators, since a value there can
   look like an operator object. Normalization still produces the canonical explicit form, so
   ASTs, serialization and adapters do not change. GraphQL filter inputs keep `{ eq }` (a GraphQL
   input cannot be a scalar or an object).
2. **Atomic updates are objects.** In update data (root, nested and upsert update branches) a
   non-list `int`, `bigint`, `float` or `decimal` field accepts `{ increment: n }` or
   `{ decrement: n }` with an operand of the field's value type; `null` clears an optional field.
   Exactly one key is allowed; numeric fields have no object values, so the form is unambiguous.
   `increment`, `decrement`, `unset`, `IncrementUpdateValue`, `DecrementUpdateValue` and
   `isNumericUpdateOperationValue` leave the public API; the update AST is unchanged.
3. **`findOneOrThrow` replaces `get`.** It takes the input of `findOne` (`where`, `orderBy`,
   `select`, `include`) and fails with `NOT_FOUND` where `findOne` returns `null`; Access treats
   it as the `one` operation. `get` is removed from schemas and relation handles.
4. **One target form for singular mutations.** `updateOne`, `deleteOne` and `upsertOne` take
   their target only through `where` (`where: { id }`); the top-level `id` alias of ADR-0182 is
   removed so that one form remains.

## Consequences

- Consumers to migrate: Core `where` types and normalization (`source-filters.ts`,
  `where-normalize.ts`), update normalization (`query/updates/`), schema API, relation handles
  (removed by ADR-0310), REST (`packages/rest-plugin/src/field-values.ts`,
  `nested-mutation-values.ts`), GraphQL (`wire-values.ts`, `mutation-input-compiler.ts`), Access
  rule evaluation, examples, `create-app` templates and website pages
  (`core/reading-data/filters.mdx`, `core/writing-data/update.mdx`, `core/reading-data/overview.mdx`).
- Tests: shorthand per eligible family, pointer identifier and `Pointer` operands, wrong-schema
  pointer rejected by type and at runtime, `null` shorthand, explicit form required on `json`,
  `object` and list fields, canonical serialization unchanged; `{ increment }` and `{ decrement }`
  on each numeric kind, rejected on non-numeric fields, with two keys and in create data; no lost
  update under concurrency (ADR-0302); `findOneOrThrow` with `NOT_FOUND`, Access `one`, hidden row
  reported as `NOT_FOUND`; `id` alias rejected. Type tests and DX audit report the removed names.
- Documentation impact: both (filters, updates, reads; Core, REST and GraphQL READMEs).

## Out of scope

Prisma's `set`, `multiply` and `divide` update operators, `findUnique`, list equality shorthand,
cursor pagination (ADR-0309) and relation linking (ADR-0308).
