# 3203: Split oversized ACL and PostgreSQL modules

- Status: planned
- Milestone: 32
- Packages: `@ultimabase/acl-permissions-plugin`, `@ultimabase/postgres-plugin`
- Depends on: 3202
- ADR: none

## Goal

Split oversized ACL enforcement, prepared mutation and filter compilation
modules along current responsibilities.

## Acceptance criteria

- [ ] Every touched handwritten production file fits the 600-line hard limit.
- [ ] ACL monotonic policy and parameterized PostgreSQL behavior stay unchanged.
- [ ] Baseline entries for files brought under the limit are removed.

## Tests

- [ ] Relevant runtime, security and PostgreSQL tests pass.
- [ ] Audit confirms no public or storage change.

## Out of scope

- New authorization or database features.
