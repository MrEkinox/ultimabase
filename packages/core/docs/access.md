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
			update: ({ originalItem, item }) =>
				item.authorId === originalItem.authorId,
		},
	},
	fields: {
		authorId: stringField({
			access: {
				update: ({ originalValue, value }) => value === originalValue,
			},
			validation: { required: true },
		}),
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
inspect transport metadata. Schema `operation` callbacks expose no terminal
`kind`: their named mutation family or grouped `one`, `many`, `count`, and
`exists` read branch is the complete public distinction. Field disclosure,
schema item, and mutation field rules retain their own discriminants because
those callbacks share one contract across materially different inputs.

Access callbacks must remain pure decisions. Runtime may evaluate a rule again
after input transformation, target locking, or final upsert branch resolution
to ensure that the decision protects the value that is actually persisted.

Field create rules traverse normalized objects parent-first. A nested field in
an object list is evaluated once per concrete list entry, including
multidimensional lists. A `null` parent evaluates only the parent field. Rules
that need siblings or the complete candidate belong in schema `item.create`.

Field output rules use the same parent-first concrete traversal. Denying a
parent omits its complete property and skips its descendants. Denying one
nested occurrence omits only that property from that object; Runtime never
removes or reorders surrounding list elements. This is structural projection,
not persisted `null`, so list cardinality and data semantics remain unchanged.

For updates, schema item rules receive the complete persisted `originalItem`
and an immutable `item` containing the final candidate after update operators
have been applied. Generic field rules receive the corresponding
`originalValue` and final `value`. Nested object rules run at each concrete
path, including object-list entries; a removed nested value is represented by
the canonical `null`. Relation field rules keep their typed relation delta
because those values are not embedded in the parent object.

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
					read: ({ where }) => where.eq('published', true),
				},
			},
			{ master: 'enforce' },
		)
	},
})
```

Schema row policies return the same typed object accepted by public `where`.
The supplied `WhereBuilder` is only an immutable utility for dynamic branches:

```ts
access: {
	filter: {
		read: ({ context, where }) =>
			context.access.mode === 'master'
				? where.eq('status', 'published')
				: { status: { eq: 'published' } },
	},
}
```

These predicates remain private and combine monotonically through `AND`.
Relationship predicates may use fields hidden from public filtering because
they are trusted server policy. Target operation Access, target row policies,
plugin constraints, and nested relationship scopes still apply recursively.

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
database adapter. Developer filtering, ordering, and limits remain explicit
Query options and cannot observe or remove the Access predicate.

Mutation field rules reject the complete operation when a present create or
update value is forbidden. Update and delete item rules receive the stable
target selected by the transaction adapter before its single-use write handle
executes. Generated-schema `updateMany` and `deleteMany` commands are ordered
batches of those singular targets, so Access runs once per entry with the same
complete `originalItem` and candidate `item` contract. Upsert item rules inspect
the exact create or update branch materialized inside the transaction, so a
denial rolls the complete batch back. These item-oriented callbacks use a
cardinality-free business `kind`; early operation Access exposes only `context`
and keeps terminal names such as `update-one` private to Runtime.

Field `read.item` rules project adapter records before they become public. The
same projection is enforced again at the final output boundary. Explicit
selection, filtering, or ordering through a
statically forbidden field fails; default reads simply omit it. A row rejected
by an Access filter appears nonexistent because the adapter never returns it.
When a pointer is eagerly included, its field rule receives the declared
`Pointer` value at both output checks. Runtime retains that identity privately
while the public result observes the hydrated target or `null`.

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
