# ADR-0253: Password Auth requires a readable User

- Status: accepted
- Date: 2026-09-20
- Supersedes: ADR-0252's nullable profile and Pointer denial-as-absence decisions

## Context

The user requires sign-up, login, and refresh to fail when their User cannot be
read. Returning `user: null` was an unnecessary extension of the requested
profile result. Changing general Core Pointer reads to normalize policy denials
into absence also exceeded the authentication requirement.

## Decision

The three operations require a readable profile before their transaction can
commit. `PasswordAuthenticationResult<TUser>.user` is `SchemaResult<TUser>`;
GraphQL declares `user: User!`, and REST returns a non-null `result.user` on
success. Existing principal and session representations remain available.

The plugin still reads through the ordinary pipeline with a fresh anonymous
context containing only the newly issued identity and session. It inherits no
Master elevation or foreign caller identity. Explicit policy denials and other
read errors propagate unchanged. An absent or row-filtered User produces the
existing generic `NOT_FOUND` error, without exposing why the target is absent.
No new error code, read option, catch-and-continue path, or privilege is added.

Every such failure rolls back the whole authentication transaction: sign-up
leaves no User, credential, or session; login leaves no new session or verifier
upgrade; refresh preserves the old token and rotation version. This applies to
direct operations, REST, GraphQL, and the backing operations of cookie routes.
GraphQL omission of `user` does not skip this requirement.

Field restrictions still apply. A readable profile may omit individual private
fields. GraphQL applies its usual field-nullability rules when completing the
selected result; this transport completion does not participate in the already
completed authentication transaction.

Core Pointer `findOne` and `exists` return to their prior execution semantics.
They no longer request `protectedPolicyDeniedAsMissing`: explicit policy denial
is a read failure and is recorded by the transaction. Missing or row-filtered
targets still return `null` or `false`. Documentation distinguishes these cases;
no broader redesign of Pointer or relation authorization is included.

The model snapshot and REST field-encoding support from ADR-0252 remains
necessary for custom User fields and is retained.

## Verification

Regression checks cover denied, row-filtered, and unexpectedly failing profile
reads for all three operations, committed session counts, retry after failed
sign-up, refresh rollback, GraphQL session-only selections, field restrictions,
required public result types, and rejection of null result snapshots.
