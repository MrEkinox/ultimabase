# 425: Define the neutral current-principal resolver

- Status: ready
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

- [ ] Core exports a nominal application-local service token and resolver contract whose result is `Pointer<TSchema> | undefined` without defining a User schema, session, credential, or authenticated authority mode.
- [ ] The resolver receives the immutable Access context and may resolve synchronously or asynchronously.
- [ ] One resolved Pointer preserves exact schema identity and object ID; ACL may convert it to its own stable principal entry without Core knowing ACL.
- [ ] Missing resolver service is valid for applications and ACLs that use only public or master behavior.
- [ ] Missing request-local identity returns `undefined` and can never grant authenticated or exact-principal access.
- [ ] Duplicate providers, cross-application service use, malformed provider results, and foreign schema Pointers fail through typed setup or execution errors.
- [ ] A compatible community provider satisfies the same contract without a concrete auth package name.
- [ ] Master authority remains orthogonal to the optional principal and retains any plugin-owned context values for audit use.

## Tests

- [ ] Public type, service lifecycle, absent-provider, absent-identity, compatible-provider, duplicate-provider, cross-application, and malformed-result tests.

## Out of scope

- User schemas, sign-up, login, credentials, sessions, or transport authentication.
- ACL matching or role membership.
