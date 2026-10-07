# 5801: Consolidate Query inclusion resolution

- Status: completed
- Milestone: 58
- Package: `@ultimabase/core`
- Depends on: none
- ADR: ADR-0154, ADR-0155, ADR-0159

## Goal

Make one private Core resolver own relationship-field and target-schema
validation for every public Query inclusion authoring path.

## Acceptance criteria

- [x] Canonical object inputs, `QueryBuilder.include()`, and inclusion AST
      normalization use one target resolver.
- [x] Pointer and relation cardinality continue to select their exact existing
      input and AST behavior.
- [x] Invalid scalar fields, missing fields, malformed targets, and mismatched
      target Query ASTs remain rejected before Runtime execution.
- [x] No public export, input shape, inferred result, or execution behavior changes.
- [x] Production TypeScript removes more lines than it adds.
- [x] Focused and repository-wide validation pass.
- [x] Documentation impact is recorded.

## Tests

- [x] Existing canonical-input, builder, and normalization tests pass.
- [x] Regression coverage proves the shared resolver rejects invalid fields and
      malformed targets consistently.

## Out of scope

- Changing pointer or relation inclusion capabilities.
- Changing Query AST shapes, selection behavior, or adapter execution.
- Splitting unrelated large Query files solely to reduce line counts.

## Documentation impact

Internal engineering documentation. The Core README and public website Query
contract remain accurate because no export, accepted input, inferred result,
AST shape, error category, or execution behavior changed. This issue and the
active plan record the private consolidation and its validation evidence.

## Outcome

`resolveQueryInclusionTarget()` now validates and returns one persisted pointer
or relation field together with its `Schema.define()` target. Canonical object
inputs, `QueryBuilder.include()`, and `normalizeQueryInclusion()` all consume
that private result instead of performing their own field-kind and target
lookups. Pointer-only projection restrictions, relation query capabilities,
selection augmentation, duplicate inclusion replacement, and target-AST
identity checks remain in their owning paths.

Production TypeScript adds 44 lines and removes 63, a net reduction of 19.
`query/input.ts` falls from 410 to 398 lines and no longer emits a file-budget
warning; `query/query.ts` falls from 537 to 519 lines. Tests add 30 lines and
remove 1 to cover canonical-input scalar rejection and malformed relationship
targets.

## Validation

- focused Query validation: 3 files, 22 tests, no type errors
- `yarn workspace @ultimabase/core test`: 266 files, 1,355 tests
- `yarn workspace @ultimabase/core typecheck`
- `yarn workspace @ultimabase/core build`
- `yarn constraints`
- `yarn check:issues`
- `yarn typecheck`
- `yarn test`: 545 files, 2,583 tests, no type errors
- `yarn lint`: 0 errors; 48 Core, 26 package, and 2 workspace file-budget warnings
- `yarn build`: every package passed build, API checks, and package linting
- `yarn test:coverage`: 620 files, 2,830 tests, no type errors
- coverage: 90.92% statements, 84.44% branches, 96.07% functions, 91.48% lines
