# ADR-0348: Plugin commands need the ACL right of their effect

- Status: accepted
- Date: 2026-10-18
- Refines: ADR-0321 (ACL rights), ADR-0344 (plugin mutations share the native policy stages); applies ADR-0288
- Approval: defect found by the test that ADR-0347 requires before its vertical slice; fix (the right follows the
  command's effect) and a separate record chosen by the user on 2026-10-18

## Context

ACL rights are row rights: a client reads a row with `read`, updates it with `update` and deletes it with `delete`
(ADR-0321). ADR-0344 put plugin commands on the native policy stages, but the ACL row policy declares the operation
kinds it constrains, and that list (`packages/acl-permissions-plugin/src/plugin.ts:219`) names only native kinds. A
plugin command reaches the policy stage as `plugin-schema-mutation`, so the ACL never filters it.

Verified on PostgreSQL with `softDelete: true` and an ACL that grants a member no right on a note: `softDeleteOne` and
`softDeleteMany` hide the note, `restoreOne` and `restoreMany` bring a hidden note back, and `softDeleteOne` returns
`{ id }` for a row the member cannot read, which reveals that it exists. `deleteOne` is refused, as it should be. The
readable-result check does not catch it: it is skipped for `{ id }`-only results (ADR-0344 decision 1).

An application that opens `softDeleteOne` in Access to every authenticated user and relies on the ACL for ownership lets
any authenticated user hide anyone's rows.

## Decision

1. **The ACL constrains plugin commands.** Its row policy also applies to `plugin-schema-mutation` and requires the
   right that matches the command's `effect`: `update` for an update command, `delete` for a delete command. Master
   still bypasses the ACL, so Master-only commands (every delete command, Soft Delete's `purgeOne`/`purgeMany`) are
   unaffected.
2. **A refused command behaves like a refused native write.** The row filter keeps the row out of the target: a one-row
   command fails with `NOT_FOUND` and writes nothing, a many-row command skips the row. Nothing tells the caller
   whether the row exists.
3. **The ACL stays generic.** It reads the command's declared effect, never a plugin or command name. A third-party
   command gets the same rule.
4. **Out of scope.** In Soft Delete's replace mode, `deleteOne` needs `delete` while `softDeleteOne` needs `update` for
   the same result. The test pins this difference; the trash record (DX review §4.4) decides it. Whether Core should
   present plugin commands to kind-scoped policies under the kind of their effect, so that a third-party policy listing
   `update-one` cannot miss them, is left to a later record.

## Examples

The developer's code does not change; what the same call does changes.

```ts
const Note = App.Schema.define({
	className: 'Note',
	fields,
	acl: true,
	softDelete: true,
}).with({
	access: { softDeleteOne: isAuthenticated, softDeleteMany: isAuthenticated },
})
// The note's ACL grants Grace `read` only.

// Before: the note is hidden for everyone.
await Note.softDeleteOne({ id }, asGrace) // { id }

// After: Grace has no `update` right on the note.
await Note.softDeleteOne({ id }, asGrace) // throws NOT_FOUND, writes nothing
await Note.softDeleteMany({ where: { id } }, asGrace) // [], writes nothing
```

## Consequences

- ACL rights apply to every request-authority write, native or plugin.
- Regression test: `packages/acl-permissions-plugin/tests/e2e/acl-plugin-commands-postgres.postgres.e2e.test.ts`
  (granted and refused rights for `softDeleteOne/Many` and `restoreOne/Many`, and `deleteOne` in replace mode).
- No type, hover or error code changes.
- **Documentation impact:** both: the ACL Permissions page states which right a plugin command needs, and this record.
