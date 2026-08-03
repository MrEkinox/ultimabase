# Core Access domain

Foundational request authority, typed context, and policy-neutral enforcement
contracts.

Core currently implements anonymous and master authority, typed plugin-owned
request values, and the monotonic enforcement primitives used by Runtime. It
does not implement CLP, ACL, roles, authenticated users, ownership, or field
permissions.

ADR-0116 makes Access itself a fundamental Core lifecycle. Issues 401 and
416–419 will add native schema and field declarations, typed row filters,
compiled `AccessPlan` instances, Runtime execution, and a PostgreSQL proof. The
official permission packages will then provide policies to that lifecycle
instead of constructing parallel permission pipelines.

The implemented low-level guard, opaque adapter constraint, and field
restriction factories remain the monotonic execution foundation. Access plans
will lower native and provider policies into those primitives while keeping
their state separate from Query and business hooks. Runtime never interprets
concrete provider configuration.

## Request access

`RequestAccess` is a closed discriminated union with exactly two modes:

```ts
type RequestAccess =
	| { readonly mode: 'anonymous' }
	| { readonly mode: 'master'; readonly keyId: string; readonly reason: string }
```

There is no `user` or `system` Core mode. Authentication, sessions, and user
schemas belong to optional plugins. Master authority identifies the verified
key without retaining its raw value. Core does not define a policy-specific
bypass table. Each installed policy plugin observes the trusted mode and owns
its own master-bypass decision without changing the authority seen by another
plugin.

## Request capabilities

Plugins can share identity-based capability tokens:

```ts
export const tenantRead = new RequestCapability('tenant:read')
```

Two tokens with the same name are intentionally different. This prevents a
transport payload from granting itself a capability by reproducing its label.

## Typed request values

Capabilities answer a boolean question. A plugin that needs typed request data
owns a `RequestContextValue<T>` token and its validation boundary:

```ts
const principalId = new RequestContextValue<string>(
	'auth.principal-id',
	(value: unknown): string => {
		if (typeof value !== 'string') {
			throw new TypeError('Invalid principal id')
		}

		return value
	},
)

const authenticated = anonymousContext.withValue(principalId, 'user-1')

authenticated.getValue(principalId) // string | undefined
anonymousContext.getValue(principalId) // undefined
```

The snapshot callback validates untrusted input and returns the detached value
retained by the derived context. Tokens compare by identity, duplicate writes
fail, and the original context remains unchanged. Diagnostic metadata remains
untyped and rejects credential-shaped fields; plugins must never place session
tokens, passwords, authorization headers, or provider secrets there.
