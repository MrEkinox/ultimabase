# 610: Generate and normalize GraphQL read inputs

- Status: completed
- Milestone: 6
- Packages: `@ultimabase/graphql-plugin`
- Depends on: 609
- ADR: ADR-0004, ADR-0143 and ADR-0238

## Goal

Generate schema-aware GraphQL read inputs and normalize them into the existing
immutable Query and Operation AST without transport-specific Runtime semantics.

## Acceptance criteria

- [x] Root get, findOne, findMany, count, and exists inputs expose exactly the
      operations enabled by the accepted GraphQL schema surface.
- [x] Filter operators derive from Core field capabilities and cover logical
      nesting, null, lists, embedded objects, pointers, relations, and portable
      plugin-field operands without duplicating Core validation.
- [x] Ordering, limits, selection, nested inclusion, and every supported
      relationship argument normalize into ordinary Core clauses.
- [x] GraphQL aliases, fragments, inline fragments, directives, and repeated
      selections produce one deterministic selection and inclusion plan or a
      stable validation error.
- [x] Unknown fields, unsupported operators, contradictory selections, invalid
      values, excessive limits, and malformed inputs fail before Runtime.
- [x] Normalized operations contain no GraphQL document, resolver info, HTTP
      request, credential, application ID, authority shape, or transport-only
      AST node.
- [x] Normalization performs no target load, policy evaluation, hook, adapter
      operation, or custom resolver execution.

## Tests

- [x] Generated-schema validation and AST-equivalence tests compare GraphQL
      reads with direct class queries across built-in and plugin field kinds.
- [x] Fuzzed malformed inputs cannot bypass Core normalization.

## Out of scope

- Relay cursor decoding, Runtime execution, mutations, plugin operations,
  custom schema merging, and HTTP behavior.
