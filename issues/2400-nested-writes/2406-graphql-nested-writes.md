# 2406: Expose nested writes through GraphQL

- Status: completed
- Milestone: 24
- Packages: `@ultimabase/graphql-plugin`, `@ultimabase/graphql-yoga-plugin`
- Depends on: 2404
- ADR: ADR-0238, ADR-0243

## Goal

Generate recursive GraphQL v1 nested mutation inputs and execute them through
the same network-independent application request boundary.

## Acceptance criteria

- [x] GraphQL creates stable source-field-specific pointer and relation nested
      input types only for operations legal on the compiled schema field.
- [x] Pointer connect uses `ID`, relation identity commands use `[ID!]`, nested
      create reuses the target create input, and nested update uses exact
      `{ id, data }` items plus existing GraphQL field update wrappers.
- [x] Lazy named input construction supports circular schema declarations
      without infinite compilation, duplicate types, unstable names, or hidden
      operation exposure.
- [x] Runtime decoding enforces command exclusivity, `true` sentinels,
      duplicates, contradictions, depth, and operation budgets that GraphQL's
      structural validation alone cannot express.
- [x] Generated resolvers pass the normalized graph only through Core's narrow
      application request executor and add no policy, Hook, transaction,
      authority, authentication, adapter, or Yoga branch.
- [x] Networkless and Yoga execution produce the same result and safe errors;
      selection sets project the completed root through existing pointer and
      Relay relation output behavior.
- [x] Introspection, source types, compiled types, Typegen-free JavaScript, and
      packed exports contain no `any` and expose no private schema or operation.

## Tests

- [x] Compiler snapshots, variable decoding, recursive types, conflicts,
      invalid sentinels, operation limits, networkless execution, browser Fetch,
      Yoga, multi-application, packed-package, and PostgreSQL tests pass.

## Out of scope

- A GraphQL-only mutation graph, custom nested resolver hooks, nested
  delete/upsert, subscriptions, federation, or root bulk nesting.
