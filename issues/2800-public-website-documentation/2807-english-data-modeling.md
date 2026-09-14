# 2807: Document data modeling

- Status: planned
- Milestone: 28
- Packages: `apps/website`, `@ultimabase/core`
- Depends on: 2805
- ADR: none

## Goal

Turn the shipped schema and model developer experience into task-oriented
English documentation with a clear path from the first schema to relationships.

## Acceptance criteria

- [ ] Pages cover schemas, built-in and plugin-owned fields, required and
      nullable values, defaults, generated values, immutable models, embedded
      objects, pointers, and relations.
- [ ] Field examples distinguish stored, embedded, virtual, and plugin-defined
      values without exposing compiler internals.
- [ ] Model examples explain construction, persisted identity, serialization,
      and immutability without introducing mutable Active Record behavior.
- [ ] Relationship introductions explain target identity and physical
      membership without duplicating Query or mutation guides.
- [ ] Every option and inferred type shown is available through current public
      exports and has a focused reason to appear in the learning path.
- [ ] ADRs remain optional background links; every public explanation stands on
      its own.

## Tests

- [ ] Representative schema and model snippets compile against source and built
      package exports.
- [ ] Type tests protect the inference behavior explained by public examples.

## Out of scope

- Query execution, mutations, security, exhaustive signatures, adapter
  implementation details, or planned framework capabilities.
