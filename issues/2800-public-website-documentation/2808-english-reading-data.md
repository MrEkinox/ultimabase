# 2808: Document reading data

- Status: completed
- Milestone: 28
- Packages: `apps/website`, `@ultimabase/core`
- Depends on: 2805
- ADR: none

## Goal

Teach readers to build precise immutable queries and load related data without
requiring knowledge of the internal operation AST.

## Acceptance criteria

- [x] Pages cover Query construction, filters, selections, ordering, limits,
      offsets, counts, existence checks, and singular versus collection
      terminals.
- [x] Pointer and relation inclusion pages explain nested selections, visible
      targets, relation predicates, emptiness, and cardinality.
- [x] Contextual relation filters are described as reusable read shaping rather
      than authorization, including their interaction with caller filters.
- [x] Examples demonstrate immutable builder behavior and current schema-root,
      model, and contextual execution surfaces without obsolete aliases.
- [x] Pagination terminology distinguishes REST offset results from GraphQL
      Relay connections and does not reintroduce removed Core cursors.
- [x] Advanced execution and policy details link to concepts and security pages
      rather than interrupting the primary query journey.

## Tests

- [x] Query examples compile against source and built public exports.
- [x] Focused runtime fixtures verify representative filters, inclusions,
      pagination, and immutable reuse shown in the documentation.

## Completion evidence

- Seven English pages publish the Read Data path: overview, filters, selections
  and results, ordering and pagination, includes, relation predicates, and
  contextual relation filters. The section follows Model Your Data in the
  canonical sidebar and page navigation.
- The overview makes schema-root object input the primary API and positions
  `QueryBuilder` as an immutable, non-executing utility for dynamic composition.
  It covers `findMany`, `findOne`, `get`, `count`, `exists`, root execution
  options, and inherited request execution.
- Filter documentation covers logical groups, scalar, text, list, null,
  pointer, embedded object, and JSON operators without exposing the internal
  operation AST. Selections explain inclusion and exclusion mode, the always
  present model `id`, exact partial results, and terminal absence semantics.
- Pagination documents explicit stable ordering, `limit`, and `offset`, plus
  insertion/deletion drift and deep-offset cost. A focused transport table
  distinguishes Core and REST offset input from GraphQL-owned Relay connections
  without restoring removed Core cursor methods or metadata.
- Includes distinguish projection-only pointers from independently filtered and
  paginated to-many relations. Relation predicates cover quantifiers, emptiness,
  filtered counts, vacuous `every`, and the shared visible-target universe.
- Contextual relation filters are presented as synchronous, reusable application
  shaping that intersects caller filters and policy. The page explicitly states
  that shaping is not authorization, does not alter physical membership, is not
  implicitly bypassed by Master, and never enters public Query or transport ASTs.
- Eight displayed TypeScript blocks mirror public-export fixtures backed by one
  checked-in Typegen declaration. Built-export and source-mapped typecheck
  projects protect selected and included result inference, supported operators,
  pointer projection limits, and the absence of Core cursor methods.
- Runtime tests verify immutable branching, canonical builder output, pointer
  and relation inclusion capabilities, relation cardinality normalization, and
  generated-declaration currency. `yarn website:validate` passes twenty-five
  content, runtime, source-type, and built-type checks; `yarn website:test`
  passes seven production browser tests.

## Out of scope

- Mutations, transport wire syntax beyond comparison links, adapter SQL, or
  unimplemented cursor APIs.
