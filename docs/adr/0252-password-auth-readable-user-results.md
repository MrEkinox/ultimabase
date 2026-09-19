# ADR-0252: Password Auth returns the readable User profile

- Status: accepted
- Date: 2026-09-19
- Refines: ADR-0235, ADR-0238, ADR-0193

## Context

The approved product change makes sign-up, login, and refresh return the current
User data beside the existing identity and session. The principal-only results
in ADR-0235 and ADR-0238 do not meet that requirement. Refresh must reflect edits
and current visibility without clients issuing another profile request.

## Decision

The three operation results become `{ principal, session, user }`.
`PasswordAuthenticationResult<TUser>.user` is `SchemaResult<TUser> | null`, using
the generated User output contract for custom fields. Logout remains
`{ revoked: true }`. Existing principal and session representations are retained.

The operation loads its exact User pointer through the ordinary read pipeline
inside the authentication transaction, after issuing or rotating the session.
A fresh anonymous Core context carries only the newly issued Password Auth
principal and session, plus the originating request ID, source, and cancellation
signal. Caller Master authority, caller subjects, and sign-up's temporary
elevation cannot broaden this read. Runtime applies installed row and field
policies and read Hooks. A rotation exposes its new session version to policies.

A missing or policy-hidden target produces `user: null`. Core's existing private
target-scope mechanism translates only nominal protected-policy denials to
absence before transaction failure tracking. Pointer `findOne` and `exists`
use this same mechanism, fulfilling the already documented hidden-target
contract (`null` and `false`). Arbitrary callback exceptions, adapter failures,
and cancellation are not swallowed. They abort the transaction, so an unsuccessful
refresh leaves the previous token usable.

Persisted model values are accepted at operation snapshot boundaries using
Core's ordinary detached native field representation. Native binary values
inside those nominal models cannot be frozen by JavaScript; mutable containers
remain rejected, as do native byte arrays outside persisted model subtrees.
Drafts and prototype-shaped impostors do not gain this exception.

REST returns the profile under `result.user`. Operation output encoding recognizes
models only from the selected application's compiled schema registry and reuses
the existing schema encoder. It never fetches additional data and does not change
JSON-field validation. GraphQL adds nullable `user: User` to `PasswordAuthPayload`
through the existing explicit schema output reference. Its selected fields use
ordinary scalar codecs and GraphQL nullability; no new generated User CRUD or
private storage surface appears. No concrete transport dependency is added to
Password Auth or Core.

The operation performs one ordinary default User read, even if a GraphQL client
omits `user`. GraphQL selection does not request relationship inclusion from this
operation. Projection-aware plugin operations and new include inputs are outside
this change. Dedicated secure-cookie recovery routes retain ADR-0236's response
contract; their backing operations still execute the profile read.

## Compatibility and verification

This extends the pre-release result at the existing operation version. Clients
selecting only the existing GraphQL fields retain their response shape; REST and
direct callers receive the additional `user` field. Credentials and stored session
verifiers remain owner-private.

Regression coverage exercises custom fields, binary and bigint encoding, hidden
fields, whole-profile denial and filtering, a Master caller, a different caller
identity, rotated session state, profile edits, rollback, and preservation of
explicit transport exposure. Type tests protect the nullable schema result.
