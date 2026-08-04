# 429: Enforce singular ACL management before authorization bypass

- Status: ready
- Milestone: 4
- Packages: `@ultimabase/acl-permissions-plugin`, `@ultimabase/core`
- Depends on: 411, 427
- ADR: ADR-0123, ADR-0128

## Goal

Keep the structural invariant that an ACL document may only be replaced through
one prepared singular update, including under trusted master execution.

## Acceptance criteria

- [ ] ACL replacement through `updateMany`, `upsert`, or `upsertMany` is rejected before business hooks or adapter execution.
- [ ] The rejection applies equally to anonymous and trusted master execution.
- [ ] `updateOne` continues to resolve the replacement against the locked current row and runs schema `resolveInput`, role persistence, and entry limits.
- [ ] ACL mutation-shape validation is independent from the ACL authorization constraint and therefore cannot be skipped by `master: "bypass"`.
- [ ] Create defaults and explicit master create input retain their existing behavior.
- [ ] Core remains policy-neutral and gains no ACL-specific branch.

## Tests

- [ ] Unit tests execute the complete enforcement dispatcher rather than calling only the validation helper.
- [ ] PostgreSQL regressions cover master `updateMany`, `upsert`, and `upsertMany` attempts plus one valid singular replacement.
