# 431: Align ACL create and update input resolution data

- Status: completed
- Milestone: 4
- Packages: `@ultimabase/acl-permissions-plugin`, `@ultimabase/core`
- Depends on: 429
- ADR: new ADR required

## Goal

Give the shared ACL `resolveInput` callback one precise and reusable meaning for
create and update instead of exposing update-expression fragments as if they
were a complete resolved object.

## Acceptance criteria

- [x] A new ADR defines the exact create candidate, locked current row, proposed next row, ACL values, and normalized mutation input exposed to each branch.
- [x] The property named `data` has one consistent meaning across create and update, or is replaced by clearer named properties before the API is considered stable.
- [x] Update `set`, `unset`, numeric operators, lists, optional fields, defaults, and automatic timestamps cannot be mistaken for their final persisted values.
- [x] Both branches remain discriminated by `operation` and expose immutable snapshots only.
- [x] The callback still runs inside the automatic mutation transaction and before structural revalidation and business effects.
- [x] Ordinary object updates that do not touch `acl` do not invoke ACL input resolution.
- [x] Documentation contains one callback safely reused for both create and update.

## Tests

- [x] Runtime and PostgreSQL tests cover `set`, `unset`, increment, unchanged fields, rollback, and locked-current-value behavior.
- [x] Compile-time tests verify precise discrimination and reject mutation of callback data.
