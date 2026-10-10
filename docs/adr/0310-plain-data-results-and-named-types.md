# ADR-0310: Plain data results, named model types and shared enums

- Status: accepted
- Date: 2026-10-09
- Supersedes, once accepted: ADR-0109, ADR-0115, ADR-0150, ADR-0151 and ADR-0201 (model
  instances and their commands); ADR-0118 (`model.relation(...)` handles), ADR-0192 and ADR-0245
  (the `model` instance surface) and ADR-0022 (enum fields) in those parts
- Refines: ADR-0297 (`Register` and name-keyed types), ADR-0005 (immutability); applies ADR-0288
- Approval: decided by the user on 2026-10-09 (`docs/handoff/revue-plugins/core.md`, decision 1;
  `docs/handoff/api-ideale-decisions.md`, decisions 6 and 10; `roles.md`, decision 5;
  `password-auth.md`, decision 6); record accepted by the user on 2026-10-09 (amended: exported
  `toJSON(value)` utility serializing results as REST does)

## Context

Results are model instances with `get`, `toJSON`, `fetch`, `update`, `delete`, `relation` and
plugin commands (`packages/core/src/schema/schema/model-class.ts`; Roles `addMember`; Soft
Delete's `model` surface): a second write path (`new Post({...}).create()`), about 500 of the 809
characters of a result hover, and examples writing `Awaited<ReturnType<...>>`. One enum is
declared twice to share a `typeName` (`examples/todo-backend/src/schema.ts`).

## Decision

1. **Results are data.** Every read and mutation returns frozen plain objects (prototype
   `Object.prototype`): field values, `Pointer` values for unincluded pointers, plain objects or
   `null` for included pointers, arrays for included relations. No result has methods.
2. **Removed.** Constructible models (`new Post(data)` and `.create()`, `.upsert()`), instance
   `update`, `delete`, `fetch`, `exists`, `get`, `toJSON`, relation handles and their `connect`,
   `disconnect`, `set`, `clear`, `findMany`, `findOne`, `count`, `exists`; the plugin `model`
   surface and the types serving them (`PersistedSchemaModel`, `PersistedSchemaReference`,
   `SchemaModel*Input`, `SchemaModelCapabilityContext`). `Pointer` keeps `id`, `schema`, `equals`
   and `toJSON` and loses `findOne` and `exists`. Everything goes through schema methods
   (`Post.updateOne({ where: { id: post.id }, data })`), related rows through `include` or a
   relation filter, links through ADR-0308; plugin instance commands become schema methods.
3. **Named types.** Core exports `Model<T>`, `CreateInput<T>` and `UpdateInput<T>`, where `T` is
   a registered schema name (`Model<"Todo">`) or `typeof Todo`; both print the name-keyed form
   through `Register` (ADR-0297). `Model<T>` is the result of `findOne` without `select` or
   `include`; `CreateInput<T>` and `UpdateInput<T>` are the `data` of `createOne` and
   `updateOne`, nested writes included. Schemas gain no `$infer` property.
4. **Enums.** `field.enum({ values })` has one signature: `values` is a non-empty string array
   (a local enum named by generators from schema and field path, ADR-0022) or a shared enum
   `defineEnum('TodoPriority', ['low', 'medium', 'high'])`, an immutable value with `name` and
   `values` used only to share one named type. The object-mapping form, TypeScript `enum`
   objects and the enum `typeName` option are removed. Two different shared enums with the same
   name fail at application construction.
5. **`toJSON(value)`.** Core exports `toJSON`, which serializes a result, a list of results or
   any value inside them exactly as REST responses do: `bigint` as a decimal string, binary as
   REST's base64 object (`{ type: 'binary', encoding: 'base64', data }`), temporal values as
   their ISO strings, a `Pointer` as its logical JSON (`{ type: 'pointer', className, id }`),
   included rows and embedded objects recursively; its type maps the input to that JSON shape.
   It serves custom routes, logs and responses (`Response.json(toJSON(todo))`); `JSON.stringify`
   on a raw result throws on `bigint`. REST uses the same implementation.

## Consequences

- Consumers: Core model code; Roles (members through `connect`), Soft Delete, Password Auth
  results, ACL helpers taking persisted references; REST (through `toJSON`) and GraphQL results;
  examples, `create-app` (`task.toJSON()` becomes `toJSON(task)`), website `models.mdx`,
  `relationships.mdx`, `fields.mdx` and the GraphQL enum naming page.
- Tests: results are frozen and method-free, including included targets; type tests for
  `Model`, `CreateInput`, `UpdateInput` with a name and with `typeof`, hovers printing
  `Model<"Todo">` from source and built packages on TypeScript 6 and 7; enum array and shared
  forms, removed forms rejected by type and at runtime, shared enum yields one GraphQL type,
  duplicate shared name rejected; `toJSON` output equal to REST responses for every field kind,
  its result type, and `JSON.stringify` succeeding on it. The DX audit reports every removed name.
- Documentation impact: both (results, models, enums, custom routes; Core and REST READMEs).

## Out of scope

`Select<T>` and `WhereBuilder<T>` (ADR-0297), object-field `typeName`, custom schema behaviour.
