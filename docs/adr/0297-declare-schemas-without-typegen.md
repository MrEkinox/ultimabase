# ADR-0297: Declare schemas without Typegen

- Status: accepted
- Date: 2026-10-09
- Supersedes, once accepted: ADR-0280, ADR-0281 and ADR-0283 where they retain
  Typegen for the named-schema graph; the retained typing boundaries of
  `docs/current-architecture.md`
- Applies: ADR-0288 (pre-release simplification)
- Approval: the user chose the declaration form and accepted this record
  with the amendments below on 2026-10-09, after the vertical slice
- Evidence: `docs/handoff/formes/` (comparison, common benchmark, TypeScript 7
  test, name-keyed hovers, class experiments) and
  `docs/handoff/prototype-typage-sans-typegen.md`

## Context

Typegen generates the application-wide schema graph so that relation targets
and complete-schema plugin callbacks (Access filters, hooks, ACL) are typed.
Developers must run generation, commit a large declaration file (1,535 lines
for the three-schema `todo-backend`, 2.3 MB at 200 schemas) and wait for it:
on the reference machine the real Typegen probe takes 3.6 s cold and 2.0 s per
edit at 10 schemas, and 42.7 s cold and 49.0 s per edit at 200 schemas.

The reference implementation rejected generation-free typing after three
failures (archived issues 6301 and 6307, ADR-0280). A prototype reproduced all
three and isolated their causes, none fundamental:

1. `pointer<T>(target: () => T)` infers and therefore resolves the target while
   the declaring schema is still being typed; capturing the thunk type and
   reading it later removes the cycle.
2. A generic call must check its callbacks to type the declared constant;
   callbacks placed in a final non-generic call are checked after every schema
   is typed.
3. `NoInfer` around field callbacks produces the "bootstrap schema" of
   ADR-0280.

Eleven declaration forms were then implemented against one fixture (four
cyclic schemas, self and many-to-many relations, cross-schema filters in both
directions and over two hops, a shape-changing plugin, plugin schema
factories), eight typo probes, hover and completion probes, and one
sequential benchmark at 10, 50 and 200 schemas, on TypeScript 6.0.3 and
7.0.2.

## Decision

Schemas are declared with `define` for data and a final `.with` for rules:

```ts
export const Todo = App.Schema.define({
	className: 'Todo',
	fields: (field) => ({
		title: field.string({ required: true }),
		assignee: field.pointer({ target: () => TodoUser }),
	}),
})
	.softDelete()
	.with({
		access: { read: { where: ({ where }) => where.eq('archived', false) } },
		hooks: { beforeUpdate: ({ item }) => {} },
	})
```

- Relation targets are thunks whose type Core captures without resolving it.
- Plugins contribute two kinds of schema extension through generic Core slots
  (Core never names a plugin): callback-free shape methods chained before
  `.with` (`softDelete()` adds `isDeleted`), and rule entries accepted by the
  final non-generic `.with`. Identity plugins contribute schema factories on
  the configured application (`App.RoleSchema.define`,
  `App.PasswordUserSchema.define`) with a cardinality the plugin declares.
- One optional declaration per application gives name-keyed types:

  ```ts
  declare module '@ultimabase/core' {
  	interface Register {
  		readonly app: typeof ultimabase
  	}
  }
  ```

  Filters, hook records, full results, inputs and query arguments then print
  as `WhereBuilder<"Todo">`, `Model<"Todo">`, `CreateInput<"Todo">`,
  `Select<"Todo">`. Without it everything compiles with structural types.
  `create-app` writes the line.

- Typegen, its plugin, generated files and generation steps are removed once
  every consumer is migrated.

## Consequences

- No generation step and no generated file. In the prototype at 200 schemas
  the check takes about 1.6 s on TypeScript 6 (0.3 s on TypeScript 7) instead
  of 42.7 s, with the same growth for every valid form; absolute numbers will
  be re-measured on the real packages.
- Hovers and messages are short and identical on TypeScript 6 and 7 for
  name-keyed types. The hover of the schema constant itself stays structural
  (about 860 characters): a `const` cannot print a short name.
- Accepted limits: `mappedBy` is checked when the application is constructed,
  not on its line; `.with` must stay the last call (a shape method after it
  recreates the cycle); the form relies on TypeScript typing a final
  non-generic call without reading its arguments, confirmed on 6.0.3 and
  7.0.2 and to be protected by compile-time tests on both.
- Custom schema behaviour is written as exported functions next to the schema;
  schemas gain no instance methods.
- Reversible: the class form
  `class Todo extends App.Schema.define({…}).softDelete() { static rules = this.with({…}) }`
  was proven viable (short constant hover, static methods, no `Register`) and
  can be reached by a mechanical codemod; it was not chosen because it needed
  two fragile checker workarounds and costs about 22 % more check time.
- Rejected with evidence: plugin-method chains and a single `define` with
  callbacks (cycles; the latter also fails beyond about 25 linked schemas), a
  class wrapper around this form (TS2506), `.build()` (cycle or lost name),
  separate rule declarations or statements, application-level rules,
  string-typed fields and getter targets.

## Proof required before acceptance

A vertical slice in the real Core and official plugins, alongside Typegen:
thunk capture in Core targets, `define(...).with(...)`, shape methods,
schema factories, `Register` and name-keyed types; the real Soft Delete and
Access plugins with cross-schema filters in both directions across files; one
plugin-contributed `where` operator; compiled declarations (`dist/*.d.ts`)
and editor behaviour from the built packages; measurements at 10, 50 and 200
schemas against the real Typegen baseline on TypeScript 6 and 7. A blocker
the prototype could not show stops the slice and reopens the choice with the
class form as fallback.

## Vertical slice result and amendments (2026-10-09)

The slice (branch `spike/schema-form-d`, handoff
`docs/handoff/tranche-verticale.md` on that branch) passed on the real Core and
official plugins: cyclic schemas across files with cross-schema filters in
both directions and over two hops, `.softDelete()`, `.acl()` with a typed
plugin `contains` operator, hooks, the eight typo probes (seven on their line)
on TypeScript 6 and 7 from source and built packages, and a PostgreSQL
end-to-end test. Measured on the same machine and session (TypeScript 6,
seconds):

| Schemas | Form D + `Register`, cold / edit | Form D without `Register`, cold / edit | Typegen, cold / edit |
| ------- | -------------------------------- | -------------------------------------- | -------------------- |
| 10      | 2.6 / 1.1                        | 2.9 / 0.9                              | 3.6 / 2.0            |
| 50      | 6.4 / 2.8                        | 8.5 / 2.5                              | 8.1 / 6.7            |
| 200     | 23.3 / 9.1                       | 73.1 / 8.4                             | 43.3 / 49.4          |

TypeScript 7 checks the 200-schema project in 6.6 s (Typegen: 14.9 s) and
reports edit diagnostics in 3.3 s.

Amendments:

1. `Register` is required, not optional: without it, Access rule checking grows
   quadratically. `create-app` writes it, and constructing an application
   without it is a clear type error.
2. The real Core source types cost about 0.1 s per schema, independently of
   the declaration form. The Core migration reduces them with measured
   targets: edit diagnostics within 1 s at 50 schemas on TypeScript 6 (0.5 s
   on TypeScript 7) and within 3 s at 200 schemas on TypeScript 6.
3. Plugin schema factories (`App.RoleSchema`, `App.PasswordUserSchema`) were not
   covered by the slice; they are proven first when Roles and Password Auth
   migrate, with the same stop rule.
4. Hovers on the real Core print `WhereBuilder<SchemaRef<"Todo">>` and
   `Readonly<Item<"Todo">>` (40 to 53 characters); `CreateInput<typeof Todo>`
   and the `select` typo message stay long and are migration work items.

## Step 0 editor differences accepted (2026-10-09)

The DX audit of migration step 0 against `main` reported two differences this
record did not announce; the user accepted both:

1. **Known regression, fixed in migration step 5:** 69 hovers of plugin
   options and callbacks (ACL `default`/`resolveInput`, `rest`, `graphql`,
   `postgres`, examples) print `ResolveSourceSchemaObject<…>` instead of the
   expanded object. It is a side effect of the fix for the TS2589/TS2615
   self-relation cycles; two bounded attempts did not remove it entirely.
2. **Property order** changes in a few result and input hovers of the old
   declaration form (same properties, different truncation); the old form is
   removed at the end of the migration.

## Step 4 conflict accepted (2026-10-11)

Requiring `Register` (amendment 1) creates TS7022/TS2502 cycles when an old-form schema reads the
registry while it is typed: `RoleSchema.define` (create-app with Roles, examples `minimal` and
`todo-backend`) and old-form Access rules inside `define` (website landing harness, Typegen
performance probes). Those places register a schema-less application
(`readonly app: UltimaBase<readonly []>`, with a comment) and keep their Typegen-provided types.
The user accepted this workaround on 2026-10-11 until migration step 6 moves Roles, create-app
and the examples to form D (`App.RoleSchema`, amendment 3) and removes the old form.

Note (migration step 6.3, 2026-10-11): ADR-0322 removed this workaround where Roles caused it.
Role schemas come from `App.RoleSchema.define`, proven on TypeScript 6 and 7 without TS7022, and
create-app with Roles, `examples/todo-backend` and the form D example register `typeof ultimabase`
again. Three places keep the schema-less registration for causes other than Roles, until their
migration steps (6.7, 6.8): `examples/minimal` (the field-level relation `where` callback of
`ExampleArticle.reviewers` reads the registry while its schema is typed), the website landing
harness and the Typegen performance probes (old-form Access rules inside `define`).

Note (2026-10-12, register-cycle spike, accepted by the user): migration step 6.3 also found that
an unfinished `define(...)` beside finished declarations made `typeof ultimabase` circular in
`Register` (TS7022/TS2502), unpredictably across TypeScript 6 and 7 and between sources and built
packages, with or without plugins. Cause: `RegisteredApplication` read `Register` through a
conditional type that mentions no type parameter, which TypeScript resolves as soon as it reads
it (for example while measuring variances during the inference of `new UltimaBase(...)`). Core now
reads the registry through `RegisterFor<TKey>`, generic in the key, so the read stays deferred;
an unfinished `define(...)` is a usable schema with a required `Register`, as this record states.
No public type or signature changed; one truncated hover and the `select` typo diagnostic of the
form D example (`typos.ts`) list the same members in another order. `tests/e2e/register-required.e2e.test.ts` guards it on TypeScript 6; the fix relies on how
TypeScript defers conditional types, so the TypeScript 6 and 7 reproduction matrix of the spike
(`docs/handoff/spike-register-cycle.md`, branch `spike/register-cycle`) is rerun at each
TypeScript upgrade.
