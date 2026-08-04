# 405: Resolve role references and deletion policies

- Status: planned
- Milestone: 4
- Packages: `@ultimabase/roles`
- Depends on: 402, 404
- ADR: ADR-0006

## Goal

Resolve UUID or normalized-name references and support explicit `fail`,
`preserve`, and `cascade` deletion without importing an ACL implementation.

## Acceptance criteria

- [ ] Names resolve to stored UUIDs.
- [ ] Unknown or ambiguous names fail.
- [ ] Rename preserves UUID identity and invalidates no existing UUID reference.
- [ ] `fail` rejects deletion while role-owned membership edges or registered external references remain.
- [ ] `preserve` removes the role while external references remain inert because neutral role resolution returns no membership.
- [ ] `cascade` removes role-owned edges and invokes only generic, explicitly registered reference-cleanup contributions.
- [ ] The roles package never imports ACL, CLP, authentication, or another reference consumer.
- [ ] Every deletion policy is transactional; cascade is master-only and audited.

## Tests

- [ ] UUID/name lookup, rename, unknown reference, each deletion policy, external cleanup contribution, rollback, and audit tests.
