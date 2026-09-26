# 4302: Collect Runtime interceptor stages in one pass

- Status: in-progress
- Milestone: 43
- Packages: `@ultimabase/core`
- Depends on: 4301
- ADR: ADR-0199, ADR-0259

## Goal

Replace the five independent scans of the ordered Runtime interceptor list with
one explicit grouping pass.

## Acceptance criteria

- [ ] Global before, schema before, schema after, global after, and prepared
      interceptors are grouped during one ordered pass.
- [ ] Global/schema execution order, operation matching, and callback attribution
      remain exact.
- [ ] Optional stages remain absent when their groups are empty.
- [ ] No dynamic registry or public contribution contract is introduced.
- [ ] Handwritten production lines decrease and focused parity tests pass.
- [ ] Documentation impact is recorded.

## Out of scope

- Merging before, after, and prepared executors.
- Changing interceptor factories or matching rules.
- Moving protected enforcement into product behavior.
