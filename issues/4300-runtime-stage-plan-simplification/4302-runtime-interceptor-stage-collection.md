# 4302: Collect Runtime interceptor stages in one pass

- Status: completed
- Milestone: 43
- Packages: `@ultimabase/core`
- Depends on: 4301
- ADR: ADR-0199, ADR-0259

## Goal

Replace the five independent scans of the ordered Runtime interceptor list with
one explicit grouping pass.

## Acceptance criteria

- [x] Global before, schema before, schema after, global after, and prepared
      interceptors are grouped during one ordered pass.
- [x] Global/schema execution order, operation matching, and callback attribution
      remain exact.
- [x] Optional stages remain absent when their groups are empty.
- [x] No dynamic registry or public contribution contract is introduced.
- [x] Handwritten production lines decrease and focused parity tests pass.
- [x] Documentation impact is recorded.

## Out of scope

- Merging before, after, and prepared executors.
- Changing interceptor factories or matching rules.
- Moving protected enforcement into product behavior.

## Outcome

The ordered interceptor list is now classified once into global-before,
schema-before, schema-after, global-after, and prepared groups. The five full
`filter` scans are gone, optional stages are still omitted for empty groups,
and handwritten production code decreases by 11 lines.

A focused regression deliberately declares global and schema interceptors in a
mixed order and proves the retained execution sequence: global before, schema
before, schema after, then global after.

## Validation

- `yarn workspace @ultimabase/core typecheck`
- `yarn vitest run --project unit packages/core/src/runtime/contributions/composition.test.ts`
- `yarn eslint packages/core/src/runtime/contributions/composition.ts packages/core/src/runtime/contributions/composition.test.ts`
  (passes with the pre-existing production `max-lines` warning)
- `yarn prettier --check packages/core/src/runtime/contributions/composition.ts packages/core/src/runtime/contributions/composition.test.ts`
- `git diff --check`

## Documentation impact

Internal engineering documentation. Runtime interceptor contracts, ordering,
and errors are unchanged, so the public website and package README remain
accurate; this issue records the private grouping simplification.
