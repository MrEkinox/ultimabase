# `@ultimabase/graphql-plugin`

Network-independent GraphQL schema generation for UltimaBase applications.

```ts
import { Schema, UltimaBase } from '@ultimabase/core'
import { graphqlPlugin } from '@ultimabase/graphql-plugin'

const Post = Schema.define({
	className: 'Post',
	fields: (field) => ({ title: field.string({ required: true }) }),
	graphql: true,
})

const application = new UltimaBase({
	schemas: [Post],
	plugins: [graphqlPlugin()],
})
await application.start()

const graphql = application.application.getPlugin('@ultimabase/graphql-plugin')
const context = application.engine.anonymous({
	requestId: crypto.randomUUID(),
	source: 'internal',
}).context

await graphql.execute({
	context,
	document: '{ findManyPost(first: 10) { nodes { id title } } }',
})
```

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

capabilities: {
	provides: [
		provideGraphqlSchemas({
			contributionId: 'admin-graphql',
			create: () => adminSchema,
		}),
	],
}
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

The generated mutation surface includes enabled singular and ordered itemized
bulk create, update, delete, and upsert commands. GraphQL input wrappers are
decoded into the same schema commands used by direct TypeScript and REST.
Create and update may eagerly include selected relationships. Delete and upsert
retain Core's flat result contract: relation hydration and pointer expansion
beyond `id` are rejected before Runtime instead of issuing a second read.

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

## Explicit plugin operations

An installed operation stays private. Add its exact application-operation token
to `graphqlPlugin({ operations })`, and its owner must also contribute a binding
for the canonical `ultimabase.graphql.operation@1.0.0` protocol while holding
active `transport:expose` privilege:

```ts
import { passwordAuthOperations } from '@ultimabase/password-auth-plugin'

graphqlPlugin({
	operations: [passwordAuthOperations.signUp, passwordAuthOperations.login],
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

Password Auth supplies compatible `signUp`, `login`, `refresh`, and `logout`
bindings without GraphQL importing or identifying that package. Its successful
payload exposes `principal.userId` and the one-time session token; passwords,
verifiers, custom User fields, and private session records are never serialized.

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
and effective order. A malformed, altered, foreign-application,
restarted-application, or context-shifted cursor is rejected as
`GRAPHQL_INVALID_CURSOR` before Runtime.
The key is cleared when the application is disposed. Relationship cursors are
not bound to a parent ID because one eager Core inclusion may page the same
relationship across several parents; target Access and ACL remain enforced by
the ordinary Runtime inclusion.

The cursor contains an offset rather than a database identity or snapshot.
Concurrent insertions and deletions can consequently shift later pages, which
may repeat or skip an item. GraphQL translates the page to existing Core
`where`, `orderBy`, `limit`, and `offset` clauses; Core has no cursor concept.

Yoga remains an optional later adapter. Compiling the package performs no
application request; networkless execution, generated fields, and selected
plugin operations enter the same Runtime boundary without opening a socket.
