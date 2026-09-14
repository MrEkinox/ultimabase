# 2808: Document reading data

- Status: planned
- Milestone: 28
- Packages: `apps/website`, `@ultimabase/core`
- Depends on: 2805
- ADR: none

## Goal

Teach readers to build precise immutable queries and load related data without
requiring knowledge of the internal operation AST.

## Acceptance criteria

- [ ] Pages cover Query construction, filters, selections, ordering, limits,
      offsets, counts, existence checks, and singular versus collection
      terminals.
- [ ] Pointer and relation inclusion pages explain nested selections, visible
      targets, relation predicates, emptiness, and cardinality.
- [ ] Contextual relation filters are described as reusable read shaping rather
      than authorization, including their interaction with caller filters.
- [ ] Examples demonstrate immutable builder behavior and current schema-root,
      model, and contextual execution surfaces without obsolete aliases.
- [ ] Pagination terminology distinguishes REST offset results from GraphQL
      Relay connections and does not reintroduce removed Core cursors.
- [ ] Advanced execution and policy details link to concepts and security pages
      rather than interrupting the primary query journey.

## Tests

- [ ] Query examples compile against source and built public exports.
- [ ] Focused runtime fixtures verify representative filters, inclusions,
      pagination, and immutable reuse shown in the documentation.

## Out of scope

- Mutations, transport wire syntax beyond comparison links, adapter SQL, or
  unimplemented cursor APIs.
