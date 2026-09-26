# 4202: Centralize normalized update-expression reading

- Status: completed
- Milestone: 42
- Packages: `@ultimabase/core`
- Depends on: 4201
- ADR: ADR-0060

## Goal

Make immutable update application and Runtime field traversal share one private
structural reader for normalized update-expression operations.

## Acceptance criteria

- [x] One private reader validates the canonical update-expression shape.
- [x] Each caller retains its exact contextual error message and operation rules.
- [x] Update semantics, Runtime traversal, and public types remain unchanged.
- [x] Handwritten production lines decrease and focused parity tests pass.
- [x] Documentation impact is recorded.

## Out of scope

- Changing update normalization or accepted operations.
- Moving Runtime traversal into Query.
- Exposing a new public update-expression API.

## Outcome

Immutable update application and Runtime field traversal now share one private
reader for the normalized expression envelope. Each caller still owns its
operation semantics and exact contextual failure. Handwritten production code
decreases by 5 lines; one focused regression protects the Runtime diagnostic.

## Validation

- `yarn workspace @ultimabase/core typecheck`
- `yarn vitest run --project unit packages/core/src/query/updates/apply.test.ts packages/core/src/runtime/operations/field-values.test.ts`
- `yarn eslint packages/core/src/query/updates/structure.ts packages/core/src/query/updates/apply.ts packages/core/src/runtime/operations/field-values.ts packages/core/src/runtime/operations/field-values.test.ts`
  (passes with the pre-existing `max-lines` warning)
- `git diff --check`

## Documentation impact

Internal engineering documentation. Update expressions and Runtime traversal
retain their public behavior, so the public website and package README remain
accurate; this issue records the private consolidation.
