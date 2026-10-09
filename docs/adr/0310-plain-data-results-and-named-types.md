# ADR-0310: Plain data results, named model types and shared enums

- Status: proposed
- Date: 2026-10-09
- Supersedes, once accepted: ADR-0109 (constructible schema models), ADR-0115 (model commands),
  ADR-0150 (instance command selections), ADR-0151 (persisted model helpers), ADR-0201 (plugin
  commands on results), ADR-0118 where it defines `model.relation(...)` handles, ADR-0192 and
  ADR-0245 where they define the `model` (instance) surface, ADR-0022 for enum fields
- Refines: ADR-0297 (`Register` and name-keyed types), ADR-0005 (immutability); applies ADR-0288
- Approval: decided by the user on 2026-10-09 (`docs/handoff/revue-plugins/core.md`, decision 1;
  `docs/handoff/api-ideale-decisions.md`, decisions 6 and 10; `roles.md`, decision 5;
  `password-auth.md`, decision 6); awaiting validation of this record

## Context

Results are model instances carrying `get`, `toJSON`, `fetch`, `update`, `delete`, `exists`,
`relation` and plugin commands (`packages/core/src/schema/schema/model-class.ts`,
`model-commands.ts`, `model-materialization.ts`; Roles `addMember`,
`packages/roles-plugin/src/role-member.ts`; Soft Delete `surfaces: ['schema', 'model']`). They
form a second write path beside schema methods (`new Post({...}).create()`), make about 500 of
the 809 characters of a result hover, and push examples to import generated types
(`TodoNestedCreateInput`) or write `Awaited<ReturnType<...>>`. The same enum is declared twice
to share a `typeName` (`examples/todo-backend/src/schema.ts`).

## Decision

1. **Results are data.** Every read and mutation returns frozen plain objects (prototype
   `Object.prototype`): field values, `Pointer` values for unincluded pointers, plain objects or
   `null` for included pointers, arrays for included relations. No result has methods.
2. **Removed.** Constructible models (`new Post(data)` and `.create()`, `.upsert()`), instance
   `update`, `delete`, `fetch`, `exists`, `get`, `toJSON`, relation handles and their `connect`,
   `disconnect`, `set`, `clear`, `findMany`, `findOne`, `count`, `exists`; the plugin `model`
   surface and the types serving them (`PersistedSchemaModel`, `PersistedSchemaReference`,
   `SchemaModel*Input`, `SchemaModelCapabilityContext`). `Pointer` keeps `id`, `schema`, `equals`
   and `toJSON` and loses `findOne` and `exists`. Everything goes through schema methods:
   `Post.updateOne({ where: { id: post.id }, data })`; related rows through `include` or a
   relation filter (`Tag.findMany({ where: { posts: { some: { id: post.id } } } })`); links
   through ADR-0308. Plugin instance commands become schema methods.
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

## Consequences

- Consumers to migrate: Core schema, query and runtime model code; Roles (members through
  `connect`, `roles.md` decision 3), Soft Delete, Password Auth results, ACL helpers taking
  persisted references; REST and GraphQL result serialization; examples, `create-app` templates
  (`console.log(task.toJSON())`), website pages `core/data-modeling/models.mdx`,
  `relationships.mdx`, `fields.mdx` and the GraphQL enum naming page.
- `JSON.stringify` of a result containing `bigint` or binary values needs a replacer; transports
  keep their wire codecs.
- Tests: results are frozen and method-free, including included targets; type tests for
  `Model`, `CreateInput`, `UpdateInput` with a name and with `typeof`, hovers printing
  `Model<"Todo">` from source and built packages on TypeScript 6 and 7; enum array and shared
  forms, removed forms rejected by type and at runtime, shared enum yields one GraphQL type,
  duplicate shared name rejected. The DX audit reports every removed name.
- Documentation impact: both.

## Out of scope

`Select<T>` and `WhereBuilder<T>` (ADR-0297), object-field `typeName`, custom schema behaviour
(exported functions, ADR-0297).
