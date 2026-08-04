# Core Access domain

Foundational request authority, typed context, and policy-neutral enforcement
contracts.

Core implements anonymous and master authority, typed plugin-owned request
values, native schema and field Access declarations, and the monotonic
enforcement primitives used by Runtime. It does not implement persisted ACL,
roles, authenticated users, ownership, or another concrete policy domain.

ADR-0116 makes Access itself a fundamental Core lifecycle. Native declarations
are retained privately by schema and field identity, compiled once per
application, and executed by Runtime before business hooks. Persisted ACL and
community packages may contribute policies to that lifecycle instead of
constructing parallel permission pipelines.

The low-level guard, opaque adapter constraint, and field restriction factories
remain available to advanced plugins. Native Access shares their monotonic
state while adding a private database row-filter channel and item-aware
transaction boundaries. Runtime never interprets concrete provider
configuration.

## Native declarations

Schema rules are grouped by `operation`, `filter`, and `item`. Schema reads may
use one shared rule or explicit `one`, `many`, `count`, and `exists` branches.
Inline field reads similarly group `item`, `filter`, and `order` disclosure;
`create` and `update` remain direct mutation decisions. A rule is either a
direct boolean or a synchronous or asynchronous callback:

```ts
const Article = Schema.define({
	className: 'Article',
	access: {
		operation: {
			read: { one: true, many: true, count: false, exists: true },
			delete: ({ context }) => context.access.mode === 'master',
		},
		item: {
			update: ({ input, item }) =>
				input.authorId === undefined || input.authorId === item.authorId,
		},
	},
	fields: {
		authorId: stringField({ validation: { required: true } }),
		secret: stringField({
			access: { read: { item: false, filter: false, order: false } },
		}),
	},
})
```

Using `read: true` or `read: false` applies the same decision to every schema
read branch or field disclosure channel. The grouped forms require every branch
so an omitted count, filter, or ordering path cannot inherit a broader default.

Callbacks receive an effect-free `AccessContext`: ordinary authority,
cancellation, request identity, unforgeable capabilities, and typed context
values. They cannot emit events, query a database, finalize transactions, or
inspect transport metadata. The terminal `kind` remains available when a
single family rule needs to distinguish singular and bulk behavior.

Declarations are validated and snapshotted without executing callbacks. They
never appear in enumerable schema or field metadata and do not alter inferred
create, update, or persisted object shapes. Runtime evaluates matching rules in
dependency and declaration order; a denial stops before later business effects.

Alternative decisions remain concise with the provider-neutral composition
helpers:

```ts
access: {
	operation: {
		update: anyOf(isOwner('author'), hasRole(Editor)),
		delete: allOf(hasRole(Administrator), not(isProtected)),
	},
}
```

`anyOf`, `allOf`, and `not` accept direct booleans and synchronous or
asynchronous callbacks. Evaluation is ordered, short-circuited, and observes
request cancellation between awaited decisions. These helpers combine branches
inside one rule only; Runtime still combines every independent developer or
plugin contribution through logical `AND`, so a local `anyOf` cannot weaken a
separate denial.

## Compiled plans and plugin policies

Application initialization now compiles one immutable Access plan for every
schema. Concise schema reads are expanded to `one`, `many`, `count`, and
`exists` terminals, concise field reads are expanded to `item`, `filter`, and
`order`, and callbacks remain dormant until Runtime execution. Plugin policies
are ordered by dependencies, configuration, and registration before native
developer declarations; denial and row-filter composition remain monotonic.

Plugins use the owner-bound `access` setup facade rather than business hooks or
untyped contribution registries:

```ts
const visibilityPlugin = definePlugin({
	name: 'example.visibility',
	setup: ({ access }) => {
		access.schema(
			'published-posts',
			Post,
			{
				filter: {
					read: ({ filter }) => filter.equalTo('published', true),
				},
			},
			{ master: 'enforce' },
		)
	},
})
```

Every contribution explicitly selects `master: 'bypass'` or
`master: 'enforce'`; Core never applies a permission-plugin-specific bypass.
The same registry can target every schema, an exact schema, an exact nested
field path, a schema or field extension, or a typed community field kind.
Targets are resolved before infrastructure connects, preserve plugin ownership
for diagnostics, and reject foreign schemas, forged definitions, and duplicate
plugin-local names.

An application with no matching rule uses its configured fallback. The concise
boolean applies to operation and field decisions together, while the complete
form distinguishes them. Omission preserves the framework's permissive
compatibility default:

```ts
const ultimabase = new UltimaBase({
	access: {
		default: { operation: false, field: true },
	},
	schemas: [Post],
	plugins: [visibilityPlugin],
})
```

The plan is private Runtime state: it contains normalized rule references and
provenance, never request data, filter results, Query AST mutations, or
per-request placeholder handlers.

## Runtime enforcement

Operation rules run after structural validation and before business hooks.
Filter rules build one private predicate per contribution; Runtime combines
them with `AND` and sends the result beside the normalized operation to the
database adapter. A `beforeFind` hook can still add business filtering,
ordering, or limits, but it cannot observe or remove the Access predicate.

Mutation field rules reject the complete operation when a present create or
update value is forbidden. Singular update and delete item rules receive the
stable target selected by the transaction adapter before its single-use write
handle executes. A value-dependent item rule on `updateMany` or `deleteMany`
fails with a typed capability error rather than materializing an unbounded row
set. Upsert item rules inspect the exact create or update branch materialized
inside the transaction, so a denial rolls the write back.

Field `read.item` rules project adapter records before output hooks. The same
projection is enforced again after result transforms, so a hook cannot restore
a forbidden value. Explicit selection, filtering, or ordering through a
statically forbidden field fails; default reads simply omit it. A row rejected
by an Access filter appears nonexistent because the adapter never returns it.

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

## Optional subject providers

Access policies can consume authentication and roles without making either one
a Core feature. A dynamic principal uses the existing nominal context token;
its absence remains an ordinary fail-closed policy result:

```ts
const principal = new RequestContextValue<Readonly<{ id: string }>>(
	'auth.principal',
	validatePrincipal,
)

const Post = Schema.define({
	className: 'Post',
	access: {
		operation: {
			read: ({ context }) => context.getValue(principal) !== undefined,
		},
	},
	fields: { title: stringField() },
})
```

Static resolver capabilities use a neutral service token. `require()` records
the dependency without requiring the provider to appear earlier in plugin
configuration:

```ts
const rolePolicy = definePlugin({
	name: 'example.role-policy',
	setup: ({ access, services }) => {
		const roles = services.require(accessRoleResolverServiceToken)

		access.schema('editors', Post, {
			operation: {
				update: ({ context }) =>
					roles.get().hasRole({
						context,
						role: new AccessSubjectReference('role', 'editor'),
					}),
			},
		})
	},
})
```

The requirement is validated after all plugin setup callbacks and before any
database connection, migration, runtime, or transport starts. An ACL or
community policy only declares it when its normalized configuration actually
contains a role. An official role plugin and a community provider are
interchangeable when they provide the exported neutral token; duplicate
providers still fail.
