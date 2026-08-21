# 1206: Remove deprecated Query compatibility aliases

- Status: completed
- Milestone: 12
- Packages: `@ultimabase/core`, `@ultimabase/typegen`
- Depends on: 1205
- ADR: ADR-0016, ADR-0095, ADR-0184

## Goal

Remove three superseded pre-release type aliases and leave one canonical public
name for schema predicates and relationship inclusions.

## Acceptance criteria

- [x] `SchemaWhereFactory` is removed in favor of `SchemaWhereInput`.
- [x] `QueryIncludedPointerFromInput` is removed in favor of `QueryIncludedFieldFromInput`.
- [x] `OperationIncludedPointer` is removed in favor of `OperationIncludedField`.
- [x] Definitions, root barrel exports, tests, current documentation, generated fixtures, and examples contain no live use of the removed names.
- [x] Historical ADRs and completed plans retain historically accurate wording.
- [x] No compatibility alias, subpath, wrapper package, or duplicate type is added.
- [x] Canonical replacements retain exact pointer and relation inference.

## Tests

- [x] Source and packed public-export tests prove the removed names are absent.
- [x] Language-service tests prove canonical completion, hover, and inclusion-result inference.
- [x] Typecheck, build, package archives, and Typegen generated consumers pass.

## Validation evidence

- The three deprecated declarations and their Core root exports were deleted;
  current production source, documentation, examples, and Typegen fixtures have
  no remaining use of the removed names.
- A shared source/packed language-service fixture proves the removed imports
  fail, canonical hovers expose `SchemaWhereInput`,
  `QueryIncludedFieldFromInput`, and `OperationIncludedField`, and pointer plus
  relation inclusion extraction retains the exact declared union.
- Existing Typegen language-service coverage retains Query, pointer, and
  relation completions and generated result inference. Historical ADR and
  completed-plan wording was not rewritten.
- Repository tests pass with 284 files and 1,805 tests, including compile-time
  checks. Constraints, typecheck, lint, formatting, build, and Changesets
  validation pass.
- Packed-package validation passes with 7 files and 44 tests, including archive
  shape, public Query declarations, and generated Typegen consumers.

## Out of scope

- Other Query API renames.
- Runtime Query or Operation AST changes.
- A compatibility migration layer.
