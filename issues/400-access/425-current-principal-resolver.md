# 425: Define the neutral current-principal resolver

- Status: completed
- Milestone: 4
- Packages: `@ultimabase/core`
- Depends on: 420, 747
- ADR: ADR-0113, ADR-0117, ADR-0122

## Goal

Let ACL and community Access providers discover one optional current principal
as an exact Core Pointer without importing or identifying an authentication
plugin.

## Target provider contract

```ts
services.provide(accessPrincipalResolverServiceToken, {
	resolveCurrent: ({ context }) => context.getValue(authPrincipal),
})
```

## Acceptance criteria

- [x] Core exports a nominal application-local service token and resolver contract whose result is an exact Core Pointer or `undefined` without defining a User schema, session, credential, or authenticated authority mode.
- [x] The resolver receives the immutable Access context and may resolve synchronously or asynchronously.
- [x] One resolved Pointer preserves exact schema identity and object ID; ACL may convert it to its own stable principal entry without Core knowing ACL.
- [x] Missing resolver service is valid for applications and ACLs that use only public or master behavior.
- [x] Missing request-local identity returns `undefined` and can never grant authenticated or exact-principal access.
- [x] Duplicate providers, cross-application service use, malformed provider results, and foreign schema Pointers fail through typed setup or execution errors.
- [x] A compatible community provider satisfies the same contract without a concrete auth package name.
- [x] Master authority remains orthogonal to the optional principal and retains any plugin-owned context values for audit use.

## Tests

- [x] Public type, service lifecycle, absent-provider, absent-identity, compatible-provider, duplicate-provider, cross-application, and malformed-result tests.

## Out of scope

- User schemas, sign-up, login, credentials, sessions, or transport authentication.
- ACL matching or role membership.
