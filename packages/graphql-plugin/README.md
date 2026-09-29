# `@ultimabase/graphql-plugin`

Network-independent GraphQL schema generation for UltimaBase applications.

```ts
import { Schema, UltimaBase } from '@ultimabase/core'
import { graphqlPlugin } from '@ultimabase/graphql-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'

const Post = Schema.define({
	className: 'Post',
	fields: (field) => ({ title: field.string({ required: true }) }),
	graphql: { operations: { findMany: true } },
})
const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is required')

const Application = UltimaBase.use(
	postgresPlugin({ schemaPolicy: 'override', url: databaseUrl }),
).use(graphqlPlugin({ acknowledgeUnverifiedProtection: true, default: false }))
const application = new Application({
	schemas: [Post],
})
try {
	await application.start()
	const graphql = application.plugin('@ultimabase/graphql-plugin')
	const context = application.anonymous({
		requestId: crypto.randomUUID(),
		source: 'internal',
	}).context
	console.log(
		await graphql.execute({
			context,
			document: '{ findManyPost(first: 10) { nodes { id title } } }',
		}),
	)
} finally {
	await application.dispose()
}
```

Use a disposable database: `override` may create or alter tables. This example
exposes one read without authorization; the acknowledgement does not add policy.
Configure and review protection before public exposure. The [website guide](../../apps/website/content/docs/1.0.0/plugins/official/graphql.mdx)
separates reusable configuration, direct execution, HTTP serving and explorers.

The plugin compiles one application-local executable `GraphQLSchema` after the
complete Core schema graph exists. Importing the package installs no behavior.
It does not import HTTP, Yoga, REST, authentication, policy, or database
providers.

## Custom schema composition

Pass completed `GraphQLSchema` values from Nexus, Pothos, GraphQL Tools, or the
reference `graphql` package through `graphqlPlugin({ schemas })`. The generated
schema is composed first, direct application schemas retain array order, and
plugin contributions follow deterministic plugin and registration order.

```ts
import { GraphQLObjectType, GraphQLSchema, GraphQLString } from 'graphql'

const custom = new GraphQLSchema({
	query: new GraphQLObjectType({
		name: 'Query',
		fields: {
			health: { type: GraphQLString, resolve: () => 'ok' },
		},
	}),
})

graphqlPlugin({ schemas: [custom] })
```

Plugins that intentionally depend on this package contribute through
`provideGraphqlSchemas()`. Each provider must declare `transport:expose`; its
resolvers run under that exact plugin and optional instance identity:

```ts
import { provideGraphqlSchemas } from '@ultimabase/graphql-plugin'

capabilities: [
	provideGraphqlSchemas({
		contributionId: 'admin-graphql',
		create: () => adminSchema,
	}),
]
```

Composition clones every contributed type and resolver into one final schema.
Distinct object, interface, input, enum, and union additions may extend the
graph. Duplicate root or type fields, enum values, union members, custom
scalars, directives, type-kind mismatches, and resolver overwrites fail startup
with provenance instead of using last-writer-wins behavior. Mutating an input
schema after startup cannot change the application schema.

Custom resolver context is exactly `{ request: RequestContext }`. Application
schemas run under application attribution, while plugin schemas retain their
provider attribution. Neither receives an application object, executor,
adapter, authority, grant, transaction, privilege host, HTTP request, or
lifecycle control. Custom batching remains resolver-owned and request-local.

## Networkless execution

The setup export provides `schema`, `execute()`, and `printSchema()`.
`execute()` accepts a string or parsed `DocumentNode`, optional variables and
operation name, plus a real context already bound to the same started
application. Foreign, forged, stale, cancelled, and disposed contexts fail
before resolver work. Parsing, validation, variables, and resolver work all run
inside the same Core request scope.

`printSchema()` returns a deterministic lexicographically sorted SDL snapshot.
It contains no resolver code, credentials, cursor secrets, private records, or
provenance internals.

Request limits default to 100 KiB of source, 10,000 tokens or parsed AST nodes,
depth 20, 100 aliases, 20 root response fields, 1 MiB of JSON-compatible
variables, page size 25, and maximum page size 100. Every limit can be narrowed
or raised explicitly through `graphqlPlugin({ limits })`. Subscriptions,
`@defer`, `@stream`, cyclic or non-JSON variables, and over-budget requests are
rejected before Runtime.

## Schema exposure

Application-owned schemas inherit the safe built-in operation defaults.
`graphql: false`, `graphql: true`, or an immutable option object overrides the
surface for one schema. A global sparse default can be supplied through
`graphqlPlugin({ default })`. Exposure only controls which GraphQL declarations
exist; it never grants access or bypasses Runtime policy.

GraphQL compilation rejects plugin-owned schemas carrying a direct `graphql`
option, invalid or colliding names, plugin fields without the canonical
`ultimabase.graphql.field@1.0.0` JSON codec, and final schemas without a query
root field. No synthetic health or placeholder query is added.

The generated read surface includes the enabled `get<Type>`, `findOne<Type>`,
`findMany<Type>`, `count<Type>`, and `exists<Type>` fields. Schema-aware filter
inputs expose only the operators supported by each Core field capability,
including portable plugin fields through their canonical GraphQL wire codec.
Ordering is an explicit ordered list. Model selections, fragments, directives,
pointers, and relation selections normalize into Core's immutable Query and
Operation AST without retaining GraphQL or HTTP objects.

GraphQL scalar and plugin-field codecs run through Core's shared filter-input
traversal before canonical Query normalization. Nested logic, relationship
predicates, filtered counts, and structured paths therefore use one Core shape
without moving GraphQL coercion or validation into Core.

Generated mutation inputs use the matching Core mutation-data traversal for
schema fields and nested pointer/relation target data. GraphQL keeps its scalar
wrappers, plugin codecs, and generated-input validation; Core still performs
the canonical bounded nested-write normalization before Runtime.

Virtual fields are output-only model fields compiled from their Core
`OutputBuilder` descriptor. Built-in scalar, enum, temporal, decimal, binary,
JSON, nullable, list, and nested object shapes receive their exact GraphQL
representation. Named output objects reuse the ordinary deterministic custom
schema composition rules, so compatible definitions merge and incompatible
fields fail startup.

```ts
const Post = Schema.define({
	className: 'Post',
	fields: (field) => ({
		title: field.string(),
		summary: field.virtual({
			output: (output) =>
				output.object({
					fields: (nested) => ({
						label: nested.string({ nullable: false }),
					}),
				}),
			resolve: async ({ context, item }) => ({
				label: `${String(item.title)}:${context.access.mode}`,
			}),
			select: { title: true },
		}),
	}),
	graphql: true,
})
```

GraphQL contributes only the logical `summary` selection. Core authorizes it,
loads its persisted dependencies privately, invokes and validates the resolver,
then returns the virtual value through the ordinary result pipeline. GraphQL
never receives the resolver or its private dependency view. Virtual names are
absent from create, update, upsert, nested-write, where, order, connection, and
relationship inputs. A plugin output descriptor without an exact GraphQL v1
representation fails schema compilation instead of degrading to JSON.

The generated mutation surface includes enabled singular and ordered itemized
bulk create, update, delete, and upsert commands. GraphQL input wrappers are
decoded into the same schema commands used by direct TypeScript and REST.
Create and update may eagerly include selected relationships. Delete and upsert
retain Core's flat result contract: relation hydration and pointer expansion
beyond `id` are rejected before Runtime instead of issuing a second read.

Singular create and update inputs expose recursive, source-field-specific
nested commands. Pointer fields accept `connect` or `create` during create and
add `update` plus nullable-only `disconnect` during update. Relation fields
accept incremental `create` and `connect`; updates additionally expose target
`update` items and, when the mapped relationship can be cleared,
`disconnect`, `set`, and `clear`:

```graphql
mutation CreatePost($authorId: ID!) {
	createPost(
		input: {
			author: { connect: $authorId }
			comments: { create: [{ body: "First" }] }
			title: "Hello"
		}
	) {
		id
		author {
			id
		}
		comments(first: 10) {
			nodes {
				id
				body
			}
		}
	}
}
```

Nested scalar values reuse the target schema's ordinary create inputs and
update wrappers. An inverse relation's injected pointer is omitted from its
source-specific target input. GraphQL coercion provides the structural shape;
Core then enforces command exclusivity, literal `true` sentinels, duplicate and
contradictory IDs, recursion depth, operation budgets, authorization, Hooks,
and the single transaction. Bulk create/update and every upsert input remain
flat and omit pointer and relation fields.

Generated resolvers accept only the application-owned context shape
`{ request: RequestContext }`. They validate that context through Core before
decoding input, then call only the narrow application request executor. Access,
ACL, validation, hooks, middleware, transactions, protected constraints, and
Master behavior therefore remain properties of the single Runtime pipeline.
Unknown failures are masked as `INTERNAL_SERVER_ERROR`; explicitly public Core
failures retain only their safe message, code, retryability, request ID, and
optional JSON details.

Every public generated schema reports Core's shared
`UNVERIFIED_PUBLIC_TRANSPORT_PROTECTION` diagnostic. Applications that have
reviewed their complete policy coverage may acknowledge it explicitly:

```ts
graphqlPlugin({ acknowledgeUnverifiedProtection: true })
```

Plugin-owned schema mutations use the same schema exposure policy. The
`operations.mutations` switch defaults to `true`, inherits through the direct
schema option and `graphqlPlugin({ default })`, and controls declarations only:

```ts
const Post = Schema.define({
	className: 'Post',
	fields: (field) => ({ title: field.string() }),
	graphql: { operations: { mutations: true } },
})
```

When the mutation owner supplies a canonical `ultimabase.graphql@1.0.0`
binding, GraphQL derives the root from the command and generated model name.
For example, the neutral `archive` command becomes:

```graphql
input ArchivePostInput {
	id: ID!
	data: ArchiveReasonInput!
}

type Mutation {
	archivePost(input: ArchivePostInput!): Post
}
```

The owner controls only the optional `data` type and its closed supporting
input-object or enum definitions. It cannot choose a root field, schema, target
ID, result type, resolver, or authority. A mutation whose logical payload is
`undefined` omits `data` and keeps only `id: ID!`. Master-only schema mutations
never enter the SDL.

The resolver derives `select` and `include` from the ordinary model selection,
validates the exact `{ request: RequestContext }` context, and invokes Core's
late-bound schema-mutation allowlist. Networkless execution and Yoga therefore
share validation, Access, Hooks, transactions, constraints, cancellation,
Master provenance, and safe-error behavior. This mechanism is separate from
the explicit application-operation allowlist below; one kind cannot be
reclassified as the other.

## Explicit plugin operations

An installed operation stays private. Add its exact application-operation token
to `graphqlPlugin({ operations })`, and its owner must also contribute a binding
for the canonical `ultimabase.graphql.operation@1.0.0` protocol while holding
active `transport:expose` privilege:

```ts
import { passwordAuthOperationList } from '@ultimabase/password-auth-plugin'

graphqlPlugin({
	operations: passwordAuthOperationList,
})
```

GraphQL validates the complete callback-free binding metadata during startup.
It may describe one `query` or `mutation` field, an optional argument named
`input`, its result, and closed supporting object, input-object, or enum types.
Invalid references, unreachable definitions, incompatible protocol versions,
owner mismatches, duplicate names, and collisions fail startup. Installed but
unselected operations do not appear in the schema.

Resolvers pass the selected `RequestContext` only to Core's existing operation
transport. Core owns codec execution, operation input/result validation, exact
callback attribution, Runtime middleware, transaction policy, cancellation,
and lifecycle checks. GraphQL never receives a handler, adapter, authority, or
authentication integration. Declared public plugin failures use the same safe
GraphQL error extensions as generated schema operations.

A supporting input-object may declare `createFieldsFrom` naming a schema owned
by the exact operation owner. Its fields reuse ordinary nested-create input
types and codecs; explicit supporting fields cannot collide with inherited
fields. This exposes no schema CRUD root and does not replay defaults.

Password Auth supplies compatible `signUp`, `login`, `refresh`, and `logout`
bindings without GraphQL importing or identifying that package. Its successful
payload exposes only `user` and `session`; select `user { id }` for the identity.
Custom User fields follow the profile's read policies. Passwords, verifiers,
and private session records are never serialized.

## Relay connections

Root collections and relations expose `edges`, `nodes`, and `pageInfo` without
`totalCount`. `first` accepts zero, defaults to 25, and is capped at 100. An
application may narrow these values explicitly:

```ts
graphqlPlugin({ limits: { defaultPageSize: 10, maxPageSize: 50 } })
```

GraphQL appends `id ASC` as the final order unless the request already orders
by `id`, fetches `first + 1` ordinary Core rows, and uses only the extra row to
derive `hasNextPage`. Every edge cursor carries the offset immediately after
that edge. Empty and exact-boundary pages therefore have deterministic page
information without a count query.

Cursors are opaque, signed with a random application-lifetime key, and bound to
the generated model type, relationship path, normalized GraphQL wire filter,
and effective order. A malformed, altered, foreign-application, or
restarted-application cursor is rejected as `GRAPHQL_INVALID_CURSOR` before
Runtime.
The key is cleared when the application is disposed. Relationship cursors are
not bound to a parent ID because one eager Core inclusion may page the same
relationship across several parents; target Access and ACL remain enforced by
the ordinary Runtime inclusion.

A source relation's declared `where` and request identity are deliberately not
encoded in the cursor. Core recomputes contextual shaping and authorization for
every page, just as it does for a direct relation read. A cursor reused under a
different legitimate context remains structurally valid but may address a
different visible collection; it is an integrity-protected offset, not an
authorization token or snapshot. Networkless GraphQL and every HTTP adapter
delegate this behavior to the same Runtime path.

The cursor contains an offset rather than a database identity or snapshot.
Concurrent insertions and deletions can consequently shift later pages, which
may repeat or skip an item. GraphQL translates the page to existing Core
`where`, `orderBy`, `limit`, and `offset` clauses; Core has no cursor concept.

Yoga is shipped as a separate optional adapter. Compiling this package performs
no application request; networkless execution, generated fields, and selected
plugin operations enter the same Runtime boundary without opening a socket.
