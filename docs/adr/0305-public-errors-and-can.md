# ADR-0305: Public application errors and policy queries in Core

- Status: proposed
- Date: 2026-10-09
- Refines: ADR-0042 (error boundary), ADR-0102 (policy contributions), ADR-0116 (Access);
  applies ADR-0288
- Approval: decided by the user on 2026-10-09 in the plugin review
  (`docs/handoff/revue-plugins/hooks.md` decision 6; `access.md` decision 11 as moved to Core by
  `acl.md` decision 11); awaiting validation of this record

## Context

Only `FrameworkError` (closed codes) and `PluginError` (codes declared per operation,
`packages/core/src/errors/plugin-error.ts`) reach clients; any error thrown by application code is
masked. A hook cannot tell a client why a write was refused. The name `PublicError` is today an
internal, unexported base class (`packages/core/src/errors/framework-error.ts`). Applications also
cannot ask whether an action is permitted without executing it (to show a button, to test rules),
and the answer must combine every installed policy (Access, ACL, Soft Delete, future ones).

## Decision

**`PublicError`.**

- Exported by Core: `new PublicError(message, { code?, details?, cause? })`. The message is a
  non-empty string shown to clients. `code` follows the plugin-code pattern (constant identifier
  or dot-namespaced) and defaults to `APPLICATION_ERROR`; framework codes are rejected so that
  application code cannot impersonate `PERMISSION_DENIED`. `details` is a plain object shown to
  clients; `cause` is never serialized. Example:
  `throw new PublicError('A title cannot contain a link.', { code: 'todo.title-link' })`.
- Thrown inside an operation (hooks, Access functions and predicates, ACL callbacks, virtual
  fields, custom operations, HTTP route handlers) it aborts the operation, rolls back, is not
  retried (ADR-0300), and transports serialize `{ code, message, details }` as a client error
  (REST 400, GraphQL error with `extensions.code`).
- Every other error that is neither `FrameworkError` nor `PluginError` stays masked as
  `INTERNAL_ERROR` with the request identifier and is logged with its stack. After commit
  (`afterCommit`, events) a `PublicError` is only logged. The internal base class is renamed.

**`ultimabase.can()`.**

- Signature: `ultimabase.can({ principal, operation, schema, item })`. `principal` is required
  (`Principal | undefined`) so the identity asked about is explicit;
  `operation` is an Access operation key (`read`, `one`, `many`, `count`, `exists`, `create`,
  `update`, `upsert`, `delete`, plugin mutation keys); `item` is optional. Returns
  `Promise<boolean>` for a non-Master caller.
- Core evaluates every installed policy contribution (ADR-0102 guards and constraints) as at
  execution time. Without `item`: `true` when no guard denies the operation (a filter counts as
  permitted for its rows). With `item` for `create`: guards and value-dependent checks run on the
  candidate data. With `item` for other operations: `item.id` designates a persisted row; in a
  read-only transaction Core checks that the row matches every row constraint of the operation,
  then runs item checks with that row as `originalItem` and `item`. A missing or hidden row gives
  `false`.
- It runs no business hook, `resolveInput`, validation, write or event, ignores field rules
  (there is no input or selection), and returns `false` for `PERMISSION_DENIED` or `PublicError`
  raised by a policy; other errors propagate. The answer can change before execution, which
  remains the enforcement point.

## Consequences

- Hooks and Access documentation replace custom thrown errors with `PublicError`; transports map
  it. Tests: serialization through REST and GraphQL, masking of other errors, rejected framework
  codes, rollback, post-commit logging; `can()` for each operation shape with Access, ACL and Soft
  Delete installed together, hidden rows, predicates, no hook executed, no write.
- Documentation impact: both (errors guide, Access and ACL pages, Core README).

## Out of scope

Custom HTTP statuses per error, replacing `PluginError`, field-level answers from `can()`.
