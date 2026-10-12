# ADR-0328: Declared relation filters move into `.with({ relations })`

- Status: proposed
- Date: 2026-10-13
- Refines: ADR-0247 (declared relation filters), ADR-0297 (form D: rules needing the complete
  schema go in `.with`), ADR-0308 (links; step 3b amendment), ADR-0316 (`.with` rules); applies
  ADR-0288
- Approval: option (b) decided by the user on 2026-10-12 after migration step 6.7; record to be
  accepted by the user
- Evidence: `docs/handoff/spike-relation-where.md` (branch `spike/relation-where`, base `main`
  e864067e)

## Context

A relation field may declare a `where` filter in `define({ fields })`. Migration step 6.7 found
that two relations filtering each other's schema make the declarations circular in form D
(TS7022, TS7023, TS2615 or TS2502 depending on the form), so `examples/minimal` lost two filters.
The spike moved the filter into the final `.with`, which already receives the complete schema: the
same declarations compile on TypeScript 6.0.3 and 7.0.2, from sources and built packages, runtime
behaviour is unchanged, the resolver parameter prints `WhereBuilder<SchemaRef<"ExampleAuthor">>`
(59 characters instead of 81), and the form D bench shows no measurable cost.

## Decision

1. **One form.** Declared relation filters are written in the final `.with`, keyed by relation
   field name:

   ```ts
   .with({
     relations: {
       articles: { where: { published: { eq: true } } },
       contributions: { where: ({ where }) => where.eq('published', true) },
     },
   })
   ```

   A rule takes a static `WhereInput` or a synchronous `({ context, where })` resolver, as the
   field-level filter did. Core exports `RelationRule<TTarget>`. An unknown name, a non-relation
   field, a duplicate filter, an unknown rule key or a non-object value fails at declaration; a
   schema without relation fields types `relations` as absent.

2. **Field-level `where` removed.** The `where` option of `field.relation` and of `relationField`
   (`RelationFieldOptions.where`) is removed. A plugin adding a relation through
   `addSchemaField(relationField(...))` cannot filter it until a real plugin needs that.
3. **Semantics unchanged.** ADR-0247 (filtered reads and includes) and the ADR-0308 step 3b
   amendment (declared filters limit reads, never unlinking) apply as before.

## Consequences

- `examples/minimal` restores its two filters; tests, READMEs and website pages
  (`related-data.mdx`, `relationships.mdx`, `security-model.mdx`) move to the new form.
- Tests: mutual filters compiling on TypeScript 6 and 7 from sources and built packages, typo and
  misuse diagnostics, identical runtime filters and inclusion row filters, the five declaration
  errors, completions inside `relations`; DX audit and form D bench.
- Documentation impact: both.

## Out of scope

Relation filters contributed by plugins, relation cardinality constraints.
