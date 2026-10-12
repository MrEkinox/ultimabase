# `@ultimabase/graphql-plugin`

Network-independent GraphQL schema generation for UltimaBase applications.

```ts
import { UltimaBase } from '@ultimabase/core'
import { anonymous } from '@ultimabase/core/plugin'
import { graphqlPlugin } from '@ultimabase/graphql-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'

// postgresPlugin() reads DATABASE_URL at start (ADR-0312).
const Application = UltimaBase.use(
	graphqlPlugin({ default: false }),
	postgresPlugin({ schemaPolicy: 'override' }),
)
const Post = Application.Schema.define({
	className: 'Post',
	fields: (field) => ({ title: field.string({ required: true }) }),
}).with({ graphql: { findMany: true } })

export const application = new Application({
	schemas: [Post],
})

await using app = await application.start()
const graphql = app.plugin('@ultimabase/graphql-plugin')
// Request contexts are plugin-author machinery (ADR-0311).
const context = anonymous(app, {
	requestId: crypto.randomUUID(),
	source: 'internal',
}).context
console.log(
	await graphql.execute({
		context,
		document: '{ findManyPost(first: 10) { nodes { id title } } }',
	}),
)
```

Use a disposable database: `override` may create or alter tables. This example
exposes one read without authorization. Configure and review protection before
public exposure. The [website guide](../../apps/website/content/docs/1.0.0/plugins/official/graphql.mdx)
separates reusable configuration, direct execution, HTTP serving and the
explorer. `apiServer({ graphql: true })` from `@ultimabase/api-server` installs
GraphQL with its HTTP transport (ADR-0325).

Install the plugin on the configured factory before declaring schemas: the
`.with({ graphql })` rule is then typed from source; `define` rejects a
`graphql` option (ADR-0297).

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
			version: { type: GraphQLString, resolve: () => '1.0.0' },
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

Internally, `@graphql-tools/utils` rewires the detached type graph. UltimaBase
still owns strict conflict preflight, root normalization, contribution order,
first-source metadata, and callback attribution; no permissive SDL merge or
last-writer-wins resolver merge is used. See [ADR-0287](../../docs/adr/0287-graphql-tools-type-rewiring.md).

Custom resolver context is exactly `{ request: RequestContext }`. Application
schemas run under application attribution, while plugin schemas retain their
provider attribution. Neither receives an application object, executor,
adapter, authority, grant, transaction, privilege host, HTTP request, or
lifecycle control. Custom batching remains resolver-owned and request-local.

## Networkless execution

The setup export provides `schema`, `execute()`, `printSchema()` and
`validationRules`, GraphQL's specified rules with hints for disabled features,
which HTTP adapters validate with.
`execute()` accepts a string or parsed `DocumentNode`, optional variables and
operation name, plus a real context already bound to the same started
application. Foreign, forged, stale, cancelled, and disposed contexts fail
before resolver work. Parsing, validation, variables, and resolver work all run
inside the same Core request scope. An optional `principal` (a pointer, or
`undefined` for an anonymous caller) replaces the authentication provider's
answer for that context, so policies evaluate the document as that identity
(ADR-0304).

A `PublicError` from application code keeps its code in `extensions.code`;
other errors are masked as `INTERNAL_SERVER_ERROR` and logged with their stack
(ADR-0305). Mutation results obey the row read rules: a selection of only `id`
(and `__typename`) is always allowed (ADR-0306).

`printSchema()` returns a deterministic lexicographically sorted SDL snapshot.
It contains no resolver code, credentials, private records, or
provenance internals. `graphqlPlugin({ sdl: './schema.graphql' })` writes the
same SDL to that file each time the application starts, for graphql-codegen or
gql.tada (ADR-0325); the plugin then declares the `environment:filesystem`
claim.

Request limits default to 100 KiB of source, 10,000 tokens or parsed AST nodes,
depth 20, 100 aliases, 20 root response fields, 1 MiB of JSON-compatible
variables, page size 25, and maximum page size 100. Every limit can be narrowed
or raised explicitly through `graphqlPlugin({ limits })`. Subscriptions,
`@defer`, `@stream`, cyclic or non-JSON variables, and over-budget requests are
rejected before Runtime.

## Schema exposure

`.with({ graphql })` selects one schema's generated fields by the schema
method names, the same keys as REST and Access rules (ADR-0325): `findOne`
(`get<Type>` and `findOne<Type>`), `findMany`, `count`, `exists`, `createOne`,
`updateOne`, `deleteOne`, `upsertOne`, `createMany`, `updateMany`,
`deleteMany`, `upsertMany`, a plugin command such as `softDeleteOne`, and
`typeName`, which renames the generated type. `graphql: false` exposes
nothing, `graphql: true` every method and command. An omitted method inherits
`graphqlPlugin({ default })` (`true`, `false` or per method), then its built-in
default: reads, `exists`, `createOne`, `updateOne` and `deleteOne` on; `count`,
upserts and the `…Many` methods off. A plugin command is exposed only when a
rule names it, or when the rule or the default is `true`; a key that names no
method or exposable command fails startup. Exposure only controls which
GraphQL declarations exist; it never grants access or bypasses Runtime policy.

```ts
const Post = Application.Schema.define({
	className: 'Post',
	fields: (field) => ({ title: field.string() }),
}).with({ graphql: { count: true, typeName: 'Article', softDeleteOne: true } })
```

A field that a disabled feature leaves out fails validation with a hint
naming the rule to set, in networkless execution and over HTTP alike:

```text
Cannot query field "countPost" on type "Query". hint: enable graphql: { count: true } on Post
```

The `Query` root always has `health: HealthStatus!`, answering `OK` or
`DEGRADED` as `ultimabase.health()` without detail. An application whose
GraphQL exposes no schema, operation or custom root therefore starts, with a
warning naming the remedy.

GraphQL refuses to start when it exposes a write (a generated mutation or a
plugin command) and no protected policy plugin, such as Access, is installed,
unless `graphqlPlugin({ publicWrites: true })` lets every client write
(ADR-0294). Public operations do not count as writes.

GraphQL compilation rejects plugin-owned schemas carrying a direct `graphql`
option, invalid or colliding names, and plugin fields without the canonical
`ultimabase.graphql.field@1.0.0` JSON codec.

The generated read surface includes the enabled `get<Type>`, `findOne<Type>`,
`findMany<Type>`, `count<Type>`, and `exists<Type>` fields. Schema-aware filter
inputs expose only the operators supported by each Core field capability and
declared by the database adapter: the adapter plugin publishes its operators
through Core's declaration-lifetime `databaseFilterOperatorsCapability`, which
GraphQL reads while it compiles (ADR-0301 decision 5, ADR-0325). A field
without any declared operator is absent from its filter input. Without a
static declaration GraphQL lists every operator, and Core still rejects an
undeclared one at request time. Portable plugin fields filter through their
canonical GraphQL wire codec.
Ordering is an explicit ordered list. Model selections, fragments, directives,
pointers, and relation selections normalize into Core's immutable Query and
Operation AST without retaining GraphQL or HTTP objects.

Internally, the existing GraphQL Tools dependency collects validated selections
with their runtime object type. UltimaBase retains relationship projection,
pagination and flat mutation-result restrictions. Document validation still
rejects conflicting selections and unknown or cyclic fragments before resolvers.

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
const Post = SchemaApplication.Schema.define({
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
}).with({
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
nested commands (ADR-0308). Pointer fields accept `connect` or `create` during
create and add `update` during update; `null` unlinks an optional pointer.
Relation fields accept incremental `create` and `connect`; updates
additionally expose target `update` items and, when the mapped relationship
can be cleared, `disconnect` and `set`, where `set: []` removes every visible
member. A `connect`, `set` or `disconnect` target that is hidden from the
caller fails with the same `NOT_FOUND` as a missing one:

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
Core then enforces command exclusivity, duplicate and contradictory IDs, link
target visibility, recursion depth, operation budgets, authorization, Hooks,
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

Plugin-owned schema mutations (commands) follow the same rule keys:

```ts
const Post = Application.Schema.define({
	className: 'Post',
	fields: (field) => ({ title: field.string() }),
})
	.softDelete()
	.with({ graphql: { softDeleteOne: true } })
```

A request command on one row needs no GraphQL binding: its field
`softDeleteOnePost(input: { id })` takes the row ID only and the command's own
input contract validates it.
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

## Public plugin operations

An operation is public only when its owner declares it
(`contributeOperation({ ..., public: { name } })`, ADR-0324): GraphQL then
exposes it, like every installed transport, and `graphqlPlugin({ hide: [token] })`
hides it; a hidden token that is not a public operation fails startup. With a
binding for the canonical `ultimabase.graphql.operation@1.0.0` protocol, the
owner describes the field, its input and result types. Without one, the
operation becomes a mutation named after its public name whose types derive
from the JSON Schema its owner declared (`public.input`, `public.output`;
`defineOperation()` reads it from its Standard JSON Schema validators, as
REST's OpenAPI does): objects become `<Name>Input` input types and
`<Name>Result` object types, nested objects `<Parent><Property>`, string
enums enums, plus lists, nullability and the `String`, `SafeInt`, `Float`
and `Boolean` scalars; any part GraphQL cannot describe (an open record, a
union) is `JSON`, and an operation without a schema takes and returns `JSON`.
A `null` input takes no argument. The operation's own contract still
validates the input (ADR-0325, 6.6c amendment).

```ts
defineOperation({
	name: 'planTrip',
	input: z.object({ title: z.string(), priority: z.enum(['low', 'high']) }),
	output: z.object({ id: z.string() }),
	handler,
})
// planTrip(input: PlanTripInput!): PlanTripResult!
```

```ts
import { authOperations } from '@ultimabase/auth-plugin'

graphqlPlugin({ hide: [authOperations.refresh] })
```

GraphQL validates the complete callback-free binding metadata during startup.
It may describe one `query` or `mutation` field, an optional argument named
`input`, its result, and closed supporting object, input-object, or enum types.
Invalid references, unreachable definitions, owner mismatches, duplicate
names, and collisions fail startup. A binding for another protocol version
leaves the default `JSON` form.

Resolvers pass the selected `RequestContext` only to Core's existing operation
transport. Core owns codec execution, operation input/result validation, exact
callback attribution, Runtime middleware, transaction policy, cancellation,
and lifecycle checks. GraphQL never receives a handler, adapter, authority, or
authentication integration. Declared public plugin failures use the same safe
GraphQL error extensions as generated schema operations.

A supporting input-object may declare `createFieldsFrom` naming a schema owned
by the exact operation owner. Its fields reuse ordinary nested-create input
types and codecs; explicit supporting fields cannot collide with inherited
fields. This exposes no schema CRUD root and does not replay defaults. When the
application chooses the schema's class name, the owner writes
`{ kind: 'owned-schema' }`, as a type reference or as `createFieldsFrom`: the
one schema the plugin adds, claims, or designates with a schema option it
defines. Zero or several such schemas fail startup.

Authentication (`@ultimabase/auth-plugin` and its methods) supplies compatible
bindings for its public operations without GraphQL importing or identifying
those packages. A successful sign-in payload exposes only `user` (the
application's User type) and `session`. Custom User fields follow the
profile's read policies. Passwords, verifiers, and private session records are
never serialized.

## Relay connections

Root collections and relations expose `edges`, `nodes`, and `pageInfo`. When
`count` is enabled for the schema, root connections also expose
`totalCount`, computed by one count query with the same `where`, only when the
document selects it; a relation connection has no count, and its `totalCount`
fails with `VALIDATION_ERROR` (ADR-0325). `first` accepts zero, defaults to
100, and is capped at 1000; a larger `first` is a GraphQL error.
`graphqlPlugin({ pagination })` sets other values with the same option and
defaults as `restPlugin({ pagination })`:

```ts
graphqlPlugin({ pagination: { defaultTake: 10, maxTake: 50 } })
```

Core completes the order with `id ASC` unless the request already orders by
`id`. GraphQL maps `first` and `after` to Core's `take` (plus one row, used only
to derive `hasNextPage`) and `after` position (ADR-0309). Every edge cursor is
the opaque position of its node, encoded by Core's shared cursor encoder
(`@ultimabase/core/plugin`) from the schema name, the effective order, and the
node's ordered values; it is the same cursor REST returns as `nextCursor`.
GraphQL selects the ordered fields and `id` of every node for that purpose,
even when the document does not ask for them. Empty and exact-boundary pages
have deterministic page information without a count query. `hasPreviousPage`
is `true` exactly when `after` was given.

Cursors are unsigned: a position grants nothing the caller could not request
as a filter, so they stay valid across restarts and between instances without
a secret. Core validates every decoded position like a caller filter: each
ordered field must be readable and filterable by the caller, or the read fails
with `PERMISSION_DENIED`. A malformed cursor, or one encoded for another type
or ordering, fails with Core's `VALIDATION_ERROR`
(`extensions.details: { parameter: "after" }`). Inserts and deletes between
pages never repeat or skip an unchanged node; a node whose ordered values
change may move.

A relation connection inside a node accepts the same `first`, `after`,
`orderBy`, and `where`: Core reads its position inside the `include`, per
parent. Its edge cursors are positions of the target schema.

A selection of relations is one SQL statement: GraphQL turns it into a Core
`include`, and PostgreSQL reads every level in one query. A virtual field on
included rows resolves once per parent, parents in parallel; a virtual field
that declares `resolveMany({ context, items })` resolves all the rows of one
read in one call. Reading relations row by row in application code, such as
`todo.relation('tags').findMany()` in a loop, stays one query per row.

Yoga is shipped as a separate optional adapter. Compiling this package performs
no application request; networkless execution, generated fields, and selected
plugin operations enter the same Runtime boundary without opening a socket.
