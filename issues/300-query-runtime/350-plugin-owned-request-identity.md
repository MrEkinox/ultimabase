# 350: Make request identity plugin-owned

- Status: completed
- Milestone: 3
- Packages: `@ultimabase/core`
- Depends on: 319, 335, 340
- ADR: ADR-0113

## Goal

Reduce foundational request authority to anonymous and master execution while
letting optional plugins attach precisely typed immutable identity data to a
request context.

## Target developer experience

```ts
interface AuthenticatedPrincipal {
	readonly id: string
}

const authenticatedPrincipal = new RequestContextValue<AuthenticatedPrincipal>(
	'auth.principal',
	(value: unknown): AuthenticatedPrincipal => validatePrincipal(value),
)

const authenticatedContext = anonymousContext.withValue(
	authenticatedPrincipal,
	{ id: 'user-1' },
)

authenticatedContext.getValue(authenticatedPrincipal)?.id
```

The concrete authentication plugin owns and exports its token. The example
only demonstrates the generic Core boundary.

## Acceptance criteria

- [x] `AccessMode` and `RequestAccess` contain only `anonymous` and `master`.
- [x] Core removes `UserRequestAccess`, `RequestContext.user()`, and `FrameworkEngine.user()` from source and built public exports.
- [x] A nominal generic request-value token owns runtime validation and snapshotting, provides exact `getValue()` inference, and cannot be forged from a matching transport string.
- [x] Immutable context derivation can add one validated plugin-owned value while preserving authority, source, request ID, signal, metadata, capabilities, and existing values.
- [x] Context derivation cannot create master authority, retain raw master credentials, silently replace an existing token value, or mutate either context.
- [x] Master elevation retains safe plugin-owned values while replacing only the authority record through the existing audited boundary.
- [x] `HookContext` exposes typed value lookup without exposing mutation, credential, adapter, or authority-construction APIs.
- [x] Runtime, hooks, transactions, and enforcement remain unaware of authentication, user schemas, sessions, providers, roles, CLP, and ACL.
- [x] Public JSDoc explains the distinction between boolean capabilities, typed values, metadata, and authority with concise hover output.
- [x] Core documentation clearly marks authentication and user identity as optional plugin behavior.

## Tests

- [x] Runtime and immutability tests cover derivation, branching, duplicate tokens, master retention, and transaction/context propagation.
- [x] Compile-time tests prove exact token value inference and removal of native user factories.
- [x] Security tests reject forged tokens, invalid values, unknown derivation input, and credential-shaped metadata.
- [x] Hook and contextual Query regression tests use fixture-owned identity tokens instead of native user contexts.
- [x] Language-service and packed-package tests verify autocomplete, documentation, and public export boundaries.

## Out of scope

- A User schema, authentication provider, session format, credential validator,
  or transport-specific authentication behavior.
- CLP, ACL, role, ownership, or field-permission policy semantics.
- Terminal execution options, which remain owned by issue 348.
