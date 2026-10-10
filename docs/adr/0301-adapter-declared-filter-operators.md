# ADR-0301: Database adapters declare the filter operators they execute

- Status: accepted
- Date: 2026-10-09
- Supersedes, once accepted: ADR-0136 where it defines `jsonPathExists`, `jsonPathMatches` and
  `containedBy` on the encoded JSONB representation
- Refines: ADR-0118 and ADR-0212 (capability checks); applies ADR-0288
- Approval: decided by the user on 2026-10-09 in the plugin review
  (`docs/handoff/revue-plugins/adaptateurs.md`, point 3); record accepted by the user on 2026-10-09
- Evidence: `docs/handoff/audit-adaptateurs-base.md`, section 4 (`main` 116cf14e)

## Context

Core fixes the built-in operators of each field family with no adapter capability
(`packages/core/src/query/filters/primitive.ts`). `jsonPathExists` and `jsonPathMatches` are
PostgreSQL SQL/JSON path passed through (`packages/postgres-plugin/src/query/filter-compiler.ts`);
`containedBy` (`<@`) has no indexable MongoDB equivalent. REST and GraphQL relay all three
(`packages/rest-plugin/src/field-values.ts`, `packages/graphql-plugin/src/filter-input-compiler.ts`,
`filter-structural-input-compiler.ts`, `wire-values.ts`). Relation predicates, inclusions and
plugin `contains` are checked only when a query executes and fail with `INTERNAL_ERROR`
(`packages/core/src/runtime/pipeline/database-capability-validation.ts`).

## Decision

1. **Removal.** `jsonPathExists`, `jsonPathMatches` and `containedBy` (discriminants
   `json-path-exists`, `json-path-matches`, `contained-by`) leave the public filter API: where
   builder, serialized `where`, REST and GraphQL inputs. Structural `contains` and the key tests
   remain, and so does the ACL `contains`.
2. **Declaration.** A database adapter declares a `filterOperators` capability: for each built-in
   field family, the discriminants it executes. A missing entry means unsupported. Relations,
   relation predicates, inclusion and plugin-field containment keep their versioned capabilities.
3. **Startup check.** Application start fails with `PLUGIN_ADAPTER_CAPABILITY_MISSING`, naming the
   schema, field, operator or capability and the adapter, when a statically known declaration needs
   something the adapter lacks: partial-index `where` clauses (ADR-0303), plugin schema options that
   contribute a filter on a field (ACL `contains`), relation fields (relation and predicate
   capabilities).
4. **Request-time check.** Operators chosen by a caller (application code, REST, GraphQL) are
   validated by Core against the declaration before the adapter is reached. An unsupported one
   fails with `VALIDATION_ERROR`, a public message naming the operator and field, and
   `publicDetails: { field, operator }`. A protected filter (Access rule, plugin constraint) using an
   unsupported operator fails with the same code and a generic public message; diagnostics go to
   the server log. No unsupported operator ever surfaces as `INTERNAL_ERROR`.
5. **Transports advertise what runs.** GraphQL filter input types and REST validation (and the
   future OpenAPI document) list only declared operators.

## Consequences

- PostgreSQL declares every current operator except the three removed ones. Test adapters
  (`tests/fixtures/official-conformance-database.ts` and package fakes) declare theirs.
- Consumers to migrate: Core filter builder, factory, normalization, serialization, source
  filters and README; REST field values; the three GraphQL files above; PostgreSQL filter compiler
  and its tests; `apps/website/content/docs/1.0.0/core/reading-data/filters.mdx`. The Typegen
  generator is removed by ADR-0297 and is not migrated.
- Tests: one startup refusal per static case; request-time `VALIDATION_ERROR` through Core, REST
  and GraphQL with a fake adapter declaring a subset; GraphQL schema without undeclared operators.
  The DX audit reports the removed builder methods, as announced here.
- Documentation impact: both.

## Out of scope

The regular-expression dialect (ADR-0302), new operators, a general plugin-operator extension
point (none has a consumer, ADR-0289), the MongoDB adapter.

## Step 1 implementation differences accepted (2026-10-10)

Migration step 1 implemented this record with one deferral and two readings; the user accepted
them on 2026-10-10:

1. **Decision 5 is deferred for GraphQL to migration step 6** (GraphQL plugin migration). The
   GraphQL schema is compiled while capabilities are materialized, before the database adapter
   can be read. Listing only declared operators needs a declaration-lifetime operator declaration
   or a GraphQL compilation after materialization. Until then the GraphQL filter input types list
   every built-in operator; an undeclared operator still fails with `VALIDATION_ERROR` at request
   time. PostgreSQL declares every remaining operator, so its GraphQL schema is exact.
2. A missing `filterOperators` declaration means no supported operator: application start fails
   with `PLUGIN_ADAPTER_CAPABILITY_MISSING`.
3. Relation fields require both the `relations` and `relationPredicates` capabilities at start.
