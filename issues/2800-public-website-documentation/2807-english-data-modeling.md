# 2807: Document data modeling

- Status: completed
- Milestone: 28
- Packages: `apps/website`, `@ultimabase/core`
- Depends on: 2805
- ADR: none

## Goal

Turn the shipped schema and model developer experience into task-oriented
English documentation with a clear path from the first schema to relationships.

## Acceptance criteria

- [x] Pages cover schemas, built-in and plugin-owned fields, required and
      nullable values, defaults, generated values, immutable models, embedded
      objects, pointers, and relations.
- [x] Field examples distinguish stored, embedded, virtual, and plugin-defined
      values without exposing compiler internals.
- [x] Model examples explain construction, persisted identity, serialization,
      and immutability without introducing mutable Active Record behavior.
- [x] Relationship introductions explain target identity and physical
      membership without duplicating Query or mutation guides.
- [x] Every option and inferred type shown is available through current public
      exports and has a focused reason to appear in the learning path.
- [x] ADRs remain optional background links; every public explanation stands on
      its own.

## Tests

- [x] Representative schema and model snippets compile against source and built
      package exports.
- [x] Type tests protect the inference behavior explained by public examples.

## Completion evidence

- Seven English pages publish the complete Model Your Data path: schemas,
  fields, models, defaults and nullability, embedded objects, pointers, and
  relations. The section now appears in canonical sidebar and page navigation.
- The field reference separates stored values, embedded objects, pointers,
  adapter-owned relation membership, output-only virtual fields, and logical
  plugin-defined fields without exposing compiler IR or physical columns.
- Model guidance distinguishes synchronous drafts from Runtime-materialized
  persisted snapshots, visible serialization from protected identity, and
  state-specific immutable commands. It explicitly excludes mutable setters,
  dirty tracking, lazy loading, and `save()`.
- Pointer and relation pages explain stable name resolution, typed identity,
  deletion behavior, owning versus inverse topology, adapter-owned membership,
  and when edge metadata requires an explicit relationship schema. Query and
  mutation syntax remains owned by later chapters.
- Every displayed TypeScript sample is mirrored by a fixture imported only
  through public package exports. A checked-in Typegen declaration represents
  the complete example application, and content validation fails if a rendered
  code block or the generated declaration drifts.
- Dedicated Vitest typecheck projects compile the same schema and model
  fixtures against both package builds and mapped package source. Type tests
  protect required create inputs, nullable defaults, readonly lists, virtual
  output separation, embedded values, typed pointers, relation omission from
  item values, and model immutability.
- `yarn website:validate` passes fifteen content and source/built type checks;
  `yarn website:test` passes seven production browser tests. Website typecheck,
  lint, production build, repository constraints, issue metadata, formatting,
  root TypeScript, and workspace lint pass. Workspace lint reports only seven
  existing file-line-budget warnings outside the site.

## Out of scope

- Query execution, mutations, security, exhaustive signatures, adapter
  implementation details, or planned framework capabilities.
