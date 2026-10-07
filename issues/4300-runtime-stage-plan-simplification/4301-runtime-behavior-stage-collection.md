# 4301: Collect Runtime behavior stages in one pass

- Status: completed
- Milestone: 43
- Packages: `@ultimabase/core`
- Depends on: none
- ADR: ADR-0199, ADR-0259

## Goal

Replace the eleven independent scans of the ordered Runtime behavior list with
one explicit stage-collection pass.

## Acceptance criteria

- [x] Every behavior stage is collected during one ordered pass.
- [x] Plugin order, callback attribution, and short-circuit behavior remain exact.
- [x] Interceptor contribution placement remains unchanged.
- [x] No dynamic registry, public type, or generic stage lookup is introduced.
- [x] Handwritten production lines decrease and focused parity tests pass.
- [x] Documentation impact is recorded.

## Out of scope

- Combining stage executors with different input or result contracts.
- Changing Runtime pipeline order or capability cardinality.
- Refactoring low-level interceptor grouping, which belongs to issue 4302.

## Outcome

Runtime behavior materialization and its eleven stage projections now happen in
one explicit pass over the ordered capability contributions. The former mapped
intermediate list and eleven independent `flatMap` scans are gone. Stage arrays
remain private, provider order and callback attribution are unchanged, and
handwritten production code decreases by 2 lines.

## Validation

- `yarn workspace @ultimabase/core typecheck`
- `yarn vitest run --project unit packages/core/src/runtime/behaviors/composition.test.ts`
- `yarn eslint packages/core/src/runtime/behaviors/composition.ts`
- `yarn prettier --check packages/core/src/runtime/behaviors/composition.ts`
- `git diff --check`

## Documentation impact

Internal engineering documentation. Runtime behavior contracts and ordering
are unchanged, so the public website and package README remain accurate; this
issue records the private collection simplification.
