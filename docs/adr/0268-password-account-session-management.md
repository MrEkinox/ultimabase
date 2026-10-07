# ADR-0268: Password account methods and generation-based session revocation

- Status: accepted
- Date: 2026-09-25
- Refines: ADR-0235, ADR-0254, ADR-0255, ADR-0267
- Approval: user explicitly approved current-User helpers, password replacement, and account-wide logout while rejecting optimistic revision work

## Context

Password Auth could create, rotate, and revoke one session, but an authenticated
User could not read its own profile through a concise method, replace its
password, or invalidate sessions created on other devices. ADR-0235 explicitly
left password change and logout-all outside V1, and ADR-0254 consequently
attached only four authentication methods to a Password User class.

Owner-private storage deliberately exposes only exact unique-record operations.
Adding a generic private `updateMany` operation solely to revoke one User's
sessions would widen Core and every database adapter beyond the accepted need.

## Decision

Password User classes add three account-scoped methods:

```ts
const me = await AppUser.current()

await AppUser.changePassword({
	currentPassword,
	newPassword,
})

await AppUser.logoutEverywhere()
```

All three require the Password Auth identity in the active request. They accept
no User identifier, context override, or Master option. Direct scripts first
enter `auth.runWithSession(token, handler)`. `current()` performs an ordinary
User `get` and therefore retains Access, ACL, field restrictions, Hooks, and
result shaping.

`changePassword()` normalizes and verifies the current password, hashes the new
password outside the write transaction, then atomically replaces the unchanged
verifier. It invalidates every other session but advances the exact current
session into the new generation, so its token remains valid after commit. A
wrong or invalid replacement secret produces the uniform
`PASSWORD_AUTH_PASSWORD_CHANGE_REJECTED` failure. A missing, stale, or
concurrently revoked session retains `PASSWORD_AUTH_INVALID_SESSION`.

`logoutEverywhere()` invalidates the current session and every other session of
the authenticated User. It never accepts a target User. Administrative
revocation is not part of this decision.

The credential record and every session record retain a non-negative session
generation. Sign-up starts generation zero; login copies the credential's
current generation into the new session. Session resolution requires both
values to match. Account-wide logout atomically advances only the credential
generation. Password replacement advances the credential generation and the
unchanged current session in one transaction. Existing session rows remain
private records and become unusable without a Core bulk-storage operation.
Refresh serializes against the credential generation before rotating its
session. A concurrent invalidation can make the rotated token immediately
stale, but refresh can never restore validity to an invalidated generation.

Two new transport-neutral application operations expose the mutations:

- `ultimabase.password-auth.change-password`;
- `ultimabase.password-auth.logout-everywhere`.

They join `passwordAuthOperationList` and receive REST, GraphQL, and optional
secure-cookie bindings. REST uses `/auth/change-password` and
`/auth/logout-everywhere`; cookie mode uses the versioned `/auth/v1/*`
counterparts. Password change preserves the current cookie. Logout everywhere
expires it. Transport exposure remains explicit outside cookie mode.

## Scope

This decision adds no session listing, device metadata, arbitrary User target,
password recovery, automatic refresh, concurrent-session limit, background
cleanup, Core authority mode, or generic private-storage query. Ordinary
`logout()` continues to revoke only its exact session through `revokedAt`.
Generated and public authentication results still expose no generation,
password verifier, or raw token beyond the one-time issued session token.

## Verification

Cover exact TypeScript methods and operation contracts, current-profile policy,
wrong-current-password rejection, preservation of the current session after a
password change, invalidation of every other session, old-password rejection,
new-password login, account-wide invalidation, concurrent transition safety,
and REST, GraphQL, Bearer, and secure-cookie bindings.
