# ADR-0335: Plugin contributions are typed without Register

- Status: accepted
- Date: 2026-10-13
- Refines: ADR-0297 (form D and its Register-cycle note), ADR-0329; applies ADR-0288
- Approval: the post-documentation fix pass decided by the user on 2026-10-13; record accepted by the user on 2026-10-13

## Context

A plugin that contributes Hooks to a registered schema, such as
`provideHookContributions('…', () => schemaHooks(Post, …))`, falls into a type cycle when the
registered application installs it, unless the factory's return type is annotated:

1. Reading `Register` evaluates `typeof ultimabase`, which comes from `App.use(postRulesPlugin)`.
2. Checking the plugin's argument needs the factory's inferred return type, which comes from
   `schemaHooks(Post, …)`.
3. `SchemaHooks<Post>` builds its keys from the plugin commands of
   `SchemaRulesSource<typeof Post>`, which reads `RegisteredSchema<'Post'>` and so reads
   `Register` again.

TypeScript then types the application as `any`. The errors appear on the plugin, on the
application, and on Hooks of unrelated schemas, far from the cause. The verified Hooks example
works around it with an annotation that the documentation has to explain. Access contributions
are not affected: `SchemaAccess` never goes through `SchemaRulesSource`.

## Decision

1. `SchemaRulesSource<T>` reads the registered schema only when `T` is a name-keyed `SchemaRef`.
   Any other schema type, such as a schema constant, supplies its own statics (plugin commands,
   permissions).
2. `SchemaRef` carries an optional, type-only `unique symbol` key that marks it without reading
   the registry. Neither the symbol nor the check that reads it is exported.
3. Contribution factories need no return annotation. A case in `tests/register-cycle` guards
   this on TypeScript 6 and 7, from sources and from built packages, for Hooks and Access
   contributions, including `fieldHooks` and `fieldAccess`.

## Rejected

- Keeping the annotation, because it fails far from its cause.
- A `RegisterFor`-style deferral, because the read is a real dependency, not an eager one.
- A Hooks-only `SchemaHooks` variant, because it duplicates the shape and leaves Core
  ungeneralised.
- A new factory shape, because it would change the public API of every contribution.

## Consequences

- `SchemaRef` gains an optional, type-only member, and the behaviour and JSDoc of
  `SchemaRulesSource` change. Usage hovers, completions and diagnostics stay the same in the
  prototype's DX audit.
- The checker cost is unchanged (+0.01% instantiations at 50 and 200 schemas). The form D bench
  must confirm the ADR-0297 thresholds on a calm machine before merging.
- The Hooks page and README drop the annotation workaround, and `examples/hooks` loses it.
- Documentation impact: both.
