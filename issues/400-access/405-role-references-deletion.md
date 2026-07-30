# 405: Resolve role references and deletion policies

- Status: planned
- Milestone: 4
- Packages: `@ultimabase/roles`
- Depends on: 402, 404
- ADR: ADR-0006

## Goal

Accept UUID or name references and support `fail`, `preserve`, and `cascade` deletion.

## Acceptance criteria

- [ ] Names resolve to stored UUIDs.
- [ ] Unknown or ambiguous names fail.
- [ ] Preserved ACL references remain inert.
- [ ] Cascade is master-only and audited.

## Tests

- [ ] Rename and each deletion policy.
