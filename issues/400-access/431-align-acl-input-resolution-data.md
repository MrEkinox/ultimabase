# 431: Align ACL create and update input resolution data

- Status: planned
- Milestone: 4
- Packages: `@ultimabase/acl-permissions-plugin`, `@ultimabase/core`
- Depends on: 429
- ADR: new ADR required

## Goal

Give the shared ACL `resolveInput` callback one precise and reusable meaning for
create and update instead of exposing update-expression fragments as if they
were a complete resolved object.

## Acceptance criteria

- [ ] A new ADR defines the exact create candidate, locked current row, proposed next row, ACL values, and normalized mutation input exposed to each branch.
- [ ] The property named `data` has one consistent meaning across create and update, or is replaced by clearer named properties before the API is considered stable.
- [ ] Update `set`, `unset`, numeric operators, lists, optional fields, defaults, and automatic timestamps cannot be mistaken for their final persisted values.
- [ ] Both branches remain discriminated by `operation` and expose immutable snapshots only.
- [ ] The callback still runs inside the automatic mutation transaction and before structural revalidation and business effects.
- [ ] Ordinary object updates that do not touch `acl` do not invoke ACL input resolution.
- [ ] Documentation contains one callback safely reused for both create and update.

## Tests

- [ ] Runtime and PostgreSQL tests cover `set`, `unset`, increment, unchanged fields, rollback, and locked-current-value behavior.
- [ ] Compile-time tests verify precise discrimination and reject mutation of callback data.
