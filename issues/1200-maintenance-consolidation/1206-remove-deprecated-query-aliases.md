# 1206: Remove deprecated Query compatibility aliases

- Status: ready
- Milestone: 12
- Packages: `@ultimabase/core`, `@ultimabase/typegen`
- Depends on: 1205
- ADR: ADR-0016, ADR-0095, ADR-0184

## Goal

Remove three superseded pre-release type aliases and leave one canonical public
name for schema predicates and relationship inclusions.

## Acceptance criteria

- [ ] `SchemaWhereFactory` is removed in favor of `SchemaWhereInput`.
- [ ] `QueryIncludedPointerFromInput` is removed in favor of `QueryIncludedFieldFromInput`.
- [ ] `OperationIncludedPointer` is removed in favor of `OperationIncludedField`.
- [ ] Definitions, root barrel exports, tests, current documentation, generated fixtures, and examples contain no live use of the removed names.
- [ ] Historical ADRs and completed plans retain historically accurate wording.
- [ ] No compatibility alias, subpath, wrapper package, or duplicate type is added.
- [ ] Canonical replacements retain exact pointer and relation inference.

## Tests

- [ ] Source and packed public-export tests prove the removed names are absent.
- [ ] Language-service tests prove canonical completion, hover, and inclusion-result inference.
- [ ] Typecheck, build, package archives, and Typegen generated consumers pass.

## Out of scope

- Other Query API renames.
- Runtime Query or Operation AST changes.
- A compatibility migration layer.
