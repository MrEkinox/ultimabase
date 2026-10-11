# ADR-0321: ACL as a shape method, atomic sharing and safe backfill

- Status: proposed
- Date: 2026-10-11
- Refines: the ACL plugin records, ADR-0297 (shape methods), ADR-0304 (principal), ADR-0305
  (`can()`), ADR-0313 (logger), ADR-0316 (slots and `.with` rules), ADR-0320 (PostgreSQL
  synchronization); applies ADR-0288
- Approval: decisions of the ACL review (`docs/handoff/revue-plugins/acl.md`, decisions 1 to 13,
  validated by the user on 2026-10-09); record to be accepted by the user
- Already implemented elsewhere: typed principal (ADR-0304), `can()` (ADR-0305)

## Context

ACL stores per-row permissions in an `acl` field added by a schema option, which is the last
projection template left in the form D benchmark application (the 6.0 spike measured the slot
version at 1.72 s against 2.05 s at 50 schemas). An empty ACL hides a row from everyone but
Master, sharing is read-modify-write (two concurrent shares overwrite each other), entries are
only readable through `toJSON()` with opaque role strings, and enabling ACL on a table with rows
leaves them `NULL`: invisible to clients and failing for Master.

## Decision

1. **Shape method and rules.** `.acl()` adds the field through the `SchemaFieldsHKT` slot and
   `.with({ acl: { default, resolveInput, limits, clientSharing } })` configures it. `default`
   is required by the type when ACL is enabled. The template-based schema option is removed.
2. **Shortcuts.** `new ACL(principal)` grants read and write to the owner (an empty ACL for
   `undefined`), like `new Parse.ACL(user)`; the permission group `'write'` means `update` and
   `delete`, as in Access.
3. **Master and `resolveInput`.** Master may write an explicit ACL; `resolveInput` only
   recomputes the ACL from the row's data.
4. **Atomic sharing.** `data: { acl: { grant: { principal, permissions } } }` and
   `data: { acl: { revoke: { principal } } }` apply in the database without read-modify-write;
   replacing an ACL through `upsert` or a set-based update stays refused.
5. **Client sharing on explicit permission.**
   `.with({ acl: { clientSharing: ({ principal, currentAcl }) => boolean } })` lets a non-Master
   caller read the ACL of the rows it may share and apply `grant`/`revoke`; without it, clients
   cannot. A client can never grant permissions it does not hold itself.
6. **Selecting the ACL.** `select: { acl: true }` is accepted only for Master (literal
   `useMasterKey: true` in the type when that costs nothing measurable, otherwise a clear
   runtime error), and for `clientSharing` callers on the rows they may share.
7. **Readable entries.** `acl.entries()` returns typed entries: users as `Pointer`s, roles as
   role references whose name can be read, `public` and `authenticated` with their permissions.
8. **Backfill when enabling.** When synchronization adds the column to a table: an empty table
   gets the column directly; with rows, a fixed value (a static `default` or the rule
   `existingRows`) adds it as `NOT NULL DEFAULT …`; a function `default` without `existingRows`
   fails `start()` with the steps to follow. Under `schemaPolicy: 'fail'` nothing changes and the
   message names the value to provide. The column is `NOT NULL`. Disabling ACL later keeps the
   column and its data and drops the index.
9. **Kept.** `limits`, SQL compilation, the name `resolveInput`, the ACL change event (consumable
   by the application, best effort as decided for Hooks).

## Consequences

- Documentation contrasts Access (rules computed for all rows) and ACL (rights stored per row).
- Tests: shape method and slot typing, required `default`, `new ACL(principal)`, `'write'`
  group, Master explicit ACL, concurrent `grant`/`revoke` without lost update, `clientSharing`
  and the no-escalation guard, `select: { acl }` rules, `entries()`, backfill on empty and
  non-empty tables with each `default` form and under `fail`, disabling; DX audit and form D
  bench (expected: the remaining gain of the 6.0 spike).
- Documentation impact: both (ACL page and README, security pages).

## Out of scope

Time-limited shares, a distinct "share" permission (covered by `clientSharing`), multi-tenant
isolation.
