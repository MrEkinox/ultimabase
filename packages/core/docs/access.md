# Core request authority

Foundational request authority, typed context, subjects, and policy-neutral
enforcement contracts.

Core implements anonymous and audited-master authority, typed plugin-owned
request values, optional subject protocols, and generic monotonic enforcement.
It does not declare schema or field `access` options and does not implement
persisted ACL, roles, authenticated users, ownership, or another concrete
policy domain.

The official `@ultimabase/access-plugin` owns its authoring vocabulary,
compilation, provider contracts, diagnostics, and Runtime behavior. ACL and
independent engines use Core's protected-policy and adapter-constraint
contracts directly. Omitting every policy engine leaves direct CRUD without an
Access policy stage; structural validation, protected constraints, transaction
safety, and Core authority remain active.

## Request access

`RequestAccess` is a closed discriminated union with exactly two modes:

```ts
type RequestAccess =
	| { readonly mode: 'anonymous' }
	| { readonly mode: 'master'; readonly keyId: string; readonly reason: string }
```

There is no `user` or `system` Core mode. Authentication, sessions, and user
schemas belong to optional plugins. Master authority identifies the verified
key without retaining its raw value. Official Access and ACL authorization
always bypass master. Core does not define a policy-specific bypass table;
independent plugins select bypass on their generic policy contribution without
changing the authority seen by another plugin. Integrity constraints may remain
enforced for master.

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

## Optional subject providers

Authentication and role plugins may publish application capabilities without
granting authority by themselves. Dynamic principals use nominal
`RequestContextValue<T>` tokens. Stable role lookup uses the versioned
`requestRoleResolverCapability`; deletion coordination uses
`requestSubjectReferenceCleanupCapability`.

Policy plugins consume those protocols only when useful. Missing subject data
is ordinary optional state, never implicit permission, and Core neither names a
user schema nor installs a role or authentication stage. Exact capability
requirements declare compatibility without forcing provider configuration
order.
