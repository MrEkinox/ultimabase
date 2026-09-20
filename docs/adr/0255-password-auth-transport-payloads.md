# ADR-0255: Password Auth transport payloads

- Status: accepted
- Date: 2026-09-20
- Supersedes: the redundant wire principal fields retained by ADR-0252 and ADR-0253

## Context

Authentication already returns a required readable User profile. REST's
`principal.user` pointer and GraphQL's `principal.userId` duplicate its identity.
The user explicitly approved removing this duplication from both transports.

## Decision

REST and GraphQL sign-up, login, and refresh payloads expose only `user` and
`session`. Clients use `user.id` for identity. Both bindings use one internal
encoder that projects these fields from the canonical operation result.

GraphQL removes the `principal` field and the `PasswordAuthPrincipal` type.
There is no compatibility alias. This is an intentional pre-release wire
contract change; older selections must migrate to `user { id }`.

Direct server operations and User class methods retain their existing
`PasswordAuthenticationResult`, including the principal. Request identity,
credential checks, readable-profile policies, transactions, session rotation,
and logout results are unchanged. Operation tokens and versions remain the same
because the server operation contract is unchanged. The separate secure-cookie
endpoint contract is outside this REST/GraphQL binding change.

No Core change, public helper, new route, or authorization behavior is introduced.

## Verification

Regression tests cover exact REST keys across all three transitions, GraphQL
schema and type removal, rejection of obsolete GraphQL selections, and identity
use across REST and GraphQL. Direct operation tests retain the principal contract.
