# ADR-0238: GraphQL v1 uses the application request kernel

- Status: accepted
- Date: 2026-09-07
- Refines: ADR-0010, ADR-0186, ADR-0190, ADR-0191, ADR-0193, ADR-0209, ADR-0224, ADR-0225, ADR-0226, ADR-0227, ADR-0229, ADR-0230, ADR-0231, ADR-0232, ADR-0233
- Depends on: ADR-0140, ADR-0143, ADR-0154, ADR-0164, ADR-0174, ADR-0181, ADR-0197, ADR-0201, ADR-0206, ADR-0218, ADR-0224, ADR-0225, ADR-0226, ADR-0227, ADR-0230, ADR-0231, ADR-0232, ADR-0233, ADR-0235
- Refined by: ADR-0239, ADR-0241, ADR-0242

## Context

ADR-0010 correctly separates network-independent GraphQL schema execution from
GraphQL over HTTP and accepts completed custom `GraphQLSchema` values. It
predates the trusted capability kernel, application-owned schema handles,
direct schema options, canonical plugin-field and operation wire protocols,
the narrow application request executor, the shared HTTP application boundary,
and Password Auth.

The old plan consequently leaves security and developer-facing behavior open:
automatic Yoga installation, schema exposure defaults, plugin identity,
operation names, nullability under dynamic output restrictions, field scalar
representations, cursor integrity, custom resolver authority, error masking,
HTTP negotiation, and authenticated execution. Implementing packages before
those choices are explicit would create a public protocol accidentally.

GraphQL v1 must remain a representation of the same logical application graph
and Runtime operations as direct TypeScript and REST. It must not create a
second policy engine, persistence path, cursor AST, authentication mechanism,
or generic extension registry.

## Decision

### GraphQL and Yoga are explicit sibling plugins

The network-independent package is `@ultimabase/graphql-plugin`. It exports
`graphqlPlugin()` and uses the stable plugin ID
`@ultimabase/graphql-plugin`. One instance compiles one final GraphQL schema for
one application. A second instance, including one with a distinct instance ID,
is rejected because two owners of the application's root GraphQL namespace and
networkless executor would be ambiguous. The v1 factory therefore exposes no
`instanceId` option.

The HTTP adapter is `@ultimabase/graphql-yoga-plugin`. It exports
`graphqlYogaPlugin()` with plugin ID `@ultimabase/graphql-yoga-plugin`. It
depends on the public GraphQL and HTTP packages and requires their application
capabilities. It never installs either plugin automatically. A complete HTTP
configuration is explicit:

```ts
new UltimaBase({
	schemas: [Post],
	plugins: [
		httpPlugin({ appId: 'notes' }),
		graphqlPlugin(),
		graphqlYogaPlugin(),
		serverHonoPlugin(),
	],
})
```

Capability requirements determine provider-first materialization and setup;
array position is not used to repair missing dependencies. Yoga stops before
GraphQL and HTTP and is disposed before their application resources. Importing
either package installs no behavior.

The dependency direction is:

```text
graphql-yoga-plugin -> http-plugin/graphql-plugin/plugin-kit/core/shared
graphql-plugin      -> plugin-kit/core/shared
```

GraphQL packages do not import REST, Password Auth, another authentication
provider, Access, ACL, PostgreSQL, Drizzle, a server implementation, or a
framework engine. `graphql-plugin` does not import HTTP or Yoga.

### Capabilities and privileges are narrow

`graphqlPlugin()` requires Core's non-replaceable
`ultimabase.application-request-execution@1.0.0` application capability. It
provides one single, application-lifetime
`ultimabase.graphql.application@1.0.0` capability containing the final schema
and its narrow execution functions. The value is materialized after the final
compiled application graph and disposed with its exact application.

The plugin requests:

- `schema:declare` to own the direct `graphql` schema option and generated
  GraphQL declarations;
- `transport:expose` when any generated schema operation or selected plugin
  operation becomes public.

It does not request `runtime:intercept`, `runtime:replace`, `adapter:raw`,
`authority:elevate`, or infrastructure privileges. It reports Core's shared
`UNVERIFIED_PUBLIC_TRANSPORT_PROTECTION` diagnostic once for protocol
`ultimabase.graphql@1.0.0` whenever its final root contains a public generated
or plugin operation. `acknowledgeUnverifiedProtection: true` acknowledges only
that diagnostic; it grants no access.

`graphqlYogaPlugin()` requires the GraphQL application capability and HTTP's
endpoint-contribution capability. It requests `transport:expose` for its HTTP
mount. It owns no schema, operation executor, authority exchange, socket, or
application-selection behavior.

### Schema exposure is explicit and provenance-aware

Installing GraphQL registers the direct `graphql` schema option. It accepts
`false`, `true`, or this immutable shape:

```ts
interface GraphqlSchemaExposure {
	readonly typeName?: string
	readonly operations?: boolean | GraphqlSchemaOperations
}

interface GraphqlSchemaOperations {
	readonly get?: boolean
	readonly findOne?: boolean
	readonly findMany?: boolean
	readonly count?: boolean
	readonly exists?: boolean
	readonly create?: boolean
	readonly update?: boolean
	readonly delete?: boolean
	readonly upsert?: boolean
	readonly bulk?:
		| boolean
		| Readonly<{
				create?: boolean
				update?: boolean
				delete?: boolean
				upsert?: boolean
		  }>
}
```

`graphqlPlugin({ default })` accepts `boolean | GraphqlSchemaOperations`.
Resolution is the exact schema operation, then the plugin default operation,
then the built-in default. Omitted properties inherit. `true` enables every
operation including count, upsert, and bulk; `false` disables all operations.

The complete top-level option shape is:

```ts
interface GraphqlExecutionLimits {
	readonly defaultPageSize?: number
	readonly maxAliases?: number
	readonly maxDepth?: number
	readonly maxDocumentBytes?: number
	readonly maxDocumentTokens?: number
	readonly maxPageSize?: number
	readonly maxRootFields?: number
	readonly maxVariablesBytes?: number
}

interface GraphqlPluginOptions {
	readonly acknowledgeUnverifiedProtection?: true
	readonly default?: boolean | GraphqlSchemaOperations
	readonly limits?: GraphqlExecutionLimits
	readonly operations?: readonly PluginOperationDefinition[]
	readonly schemas?: readonly GraphQLSchema[]
}
```

Unknown properties are rejected. Options and arrays are snapshotted before
compilation; completed custom schemas retain their exact nominal identity until
the final schema is cloned and merged.

The built-in default for application-owned schemas enables `get`, `findOne`,
`findMany`, `exists`, `create`, `update`, and `delete`. It disables `count`,
`upsert`, and every bulk operation. This matches REST's exposure posture while
retaining a GraphQL-owned option and names.

Final schema provenance decides eligibility. A plugin-owned schema never gains
generated root CRUD fields from a global default. Any direct `graphql`
occurrence on a plugin-owned schema is rejected, including `false`, because it
misrepresents who owns public behavior. A plugin-owned application schema may
still become a supporting output type for an explicitly bound plugin operation;
owner-private records from ADR-0234 never enter the GraphQL graph.

Exposure is not authorization. Disabled root fields do not exist, including for
Master. Enabled fields always execute through the ordinary Runtime pipeline and
whatever independent policy plugins are installed. GraphQL neither checks for
nor names those plugins.

The final schema must expose at least one query root field. GraphQL requires a
query root object and an empty object is not a valid schema, so compilation
fails with a provenance-aware startup diagnostic when generated and contributed
surfaces produce no query field. The plugin does not manufacture a placeholder
query because that would create an undocumented public operation. In
particular, an application exposing only mutation contributions must add an
explicit query contribution before its GraphQL schema can compile.

An exposed schema type defaults to its exact `className`. `typeName` may replace
only that GraphQL representation name. Generated type names must match
`^[A-Z][_0-9A-Za-z]*$`; field names must match
`^[_A-Za-z][_0-9A-Za-z]*$`; no generated name may begin with `__`. Invalid
field names have no alias mechanism in v1 and make exposure fail. Every root,
type, input, enum, directive, and custom contribution is validated in final
deterministic order. A duplicate name or field is a startup error containing
safe owner and contribution provenance; no suffix or last-writer-wins rule
hides a collision.

### Generated roots mirror Core operation cardinality

For a GraphQL type named `Post`, generated query fields are:

| Enabled operation | Root field     | Arguments                                                                  | Result            |
| ----------------- | -------------- | -------------------------------------------------------------------------- | ----------------- |
| `get`             | `getPost`      | `id: ID!`                                                                  | `Post`            |
| `findOne`         | `findOnePost`  | `where: PostWhere`, `orderBy: [PostOrder!]`                                | `Post`            |
| `findMany`        | `findManyPost` | `where: PostWhere`, `orderBy: [PostOrder!]`, `first: Int`, `after: String` | `PostConnection!` |
| `count`           | `countPost`    | `where: PostWhere`                                                         | `SafeInt!`        |
| `exists`          | `existsPost`   | `where: PostWhere`                                                         | `Boolean!`        |

GraphQL does not pluralize or case-fold type names. `get` preserves Core's
not-found failure. `findOne` returns null when no visible row matches.

Generated mutation fields are:

| Enabled operation | Root field       | Required argument             | Result     |
| ----------------- | ---------------- | ----------------------------- | ---------- |
| `create`          | `createPost`     | `input: PostCreateInput!`     | `Post!`    |
| bulk `create`     | `createManyPost` | `input: PostCreateManyInput!` | `[Post!]!` |
| `update`          | `updatePost`     | `input: PostUpdateOneInput!`  | `Post`     |
| bulk `update`     | `updateManyPost` | `input: PostUpdateManyInput!` | `[Post!]!` |
| `delete`          | `deletePost`     | `input: PostDeleteOneInput!`  | `Post`     |
| bulk `delete`     | `deleteManyPost` | `input: PostDeleteManyInput!` | `[Post!]!` |
| `upsert`          | `upsertPost`     | `input: PostUpsertOneInput!`  | `Post!`    |
| bulk `upsert`     | `upsertManyPost` | `input: PostUpsertManyInput!` | `[Post!]!` |

The input object shapes are exact:

```graphql
input PostCreateManyInput {
	data: [PostCreateInput!]!
}
input PostUpdateOneInput {
	id: ID
	where: PostWhere
	data: PostUpdateInput!
}
input PostUpdateManyItemInput {
	where: PostWhere!
	data: PostUpdateInput!
}
input PostUpdateManyInput {
	data: [PostUpdateManyItemInput!]!
}
input PostDeleteOneInput {
	id: ID
	where: PostWhere
}
input PostDeleteManyInput {
	where: [PostWhere!]!
}
input PostUpsertOneInput {
	where: PostWhere!
	create: PostCreateInput!
	update: PostUpdateInput!
}
input PostUpsertManyInput {
	data: [PostUpsertOneInput!]!
}
```

An update or delete one input must contain exactly one of `id` and `where`.
Every `where` used as a mutation target must resolve to an ID, one exact unique
field, or one complete unique index; GraphQL does not weaken Core's unique
target validation. Empty bulk arrays are rejected. Bulk commands remain
homogeneous, ordered, itemized, atomic operations with no partial-success mode.

Create inputs contain exactly fields accepted by Core create inference.
Required create fields are GraphQL non-null unless Core supplies a default or
generator. Update inputs contain mutable fields only and must change at least
one field. Each update field uses an operation wrapper: `{ set: value }` for
all fields and additionally `{ increment: value }` or `{ decrement: value }`
for numeric fields. Exactly one wrapper member is present. An explicit null
`set` is accepted only when Core accepts null for that field. Pointer writes use
an object ID; relation fields have no direct create or update member in v1.

The requested GraphQL selection is normalized into Core `select` and `include`
clauses. It is never accepted as an argument. Aliases, named fragments, inline
fragments, `@skip`, and `@include` are expanded and merged by response field
identity before normalization. Conflicting response-field selections fail
GraphQL validation. Pointer and relation sub-selections become ordinary Core
inclusions, so generated resolvers neither loop over parent rows nor load a
second unrestricted representation.

### Filters and ordering stay transport representations

`PostWhere` exposes only operators supported by each final Core field
capability. Logical fields retain Core's `AND`, `OR`, and `NOT` names. Portable
operator names are the existing generated Query names: `eq`, `ne`, `gt`,
`gte`, `lt`, `lte`, `between`, `notBetween`, `in`, `notIn`, `isNull`,
`isNotNull`, `contains`, `startsWith`, `endsWith`, `matches`, `has`,
`hasEvery`, `hasSome`, `isEmpty`, `containedBy`, `hasKey`, `hasAllKeys`,
`hasAnyKeys`, `jsonPathExists`, and `jsonPathMatches`. A field receives only
its legal subset. Embedded-object paths, pointer `is`/`isNot`, relation
`some`/`none`/`every`, `isEmpty`/`isNotEmpty`, and relation `count` use nested
generated inputs and retain Core's maximum relation-predicate depth.

`PostOrder` is an input object with required `field: PostOrderField!` and
`direction: GraphqlOrderDirection!`; direction values are `ASC` and `DESC`.
An ordered list preserves priority explicitly and is translated to Core's
object-shaped order input in list order. Duplicate fields are rejected. The
transport never relies on GraphQL input-object property order.

### Output nullability cannot overstate dynamic visibility

Every field on a generated application model type is nullable in GraphQL,
including `id`, system fields, required schema fields, pointers, embedded
objects, and relations. Core output restrictions may remove any field at
request time, and a static non-null declaration would otherwise turn a
legitimate policy omission into GraphQL non-null error propagation. A missing
restricted value resolves to null without an error and therefore reveals no
policy reason.

This rule affects output representation only. It does not change Core field
requiredness, storage nullability, create inputs, validators, or constraints.
Objects within successful collection lists are non-null. Root mutation and
aggregate results that Core guarantees on success remain non-null; update,
delete, get-error, and find-one positions remain nullable as shown above.
Ordinary GraphQL field errors follow standard null propagation and may produce
partial data.

### Built-in scalars have one portable wire mapping

The v1 mapping is:

| Core value                 | GraphQL representation                                           |
| -------------------------- | ---------------------------------------------------------------- |
| string                     | `String`                                                         |
| boolean                    | `Boolean`                                                        |
| int                        | `SafeInt`, a JSON number restricted to a JavaScript safe integer |
| float                      | `Float`, restricted to a finite GraphQL float                    |
| bigint                     | `BigInt`, a canonical base-10 string                             |
| decimal                    | `Decimal`, Core's canonical decimal string                       |
| date                       | `Date`, canonical `YYYY-MM-DD` string                            |
| time                       | `Time`, Core's canonical time string                             |
| dateTime                   | `DateTime`, canonical UTC timestamp string                       |
| binary                     | `Base64`, canonical padded base64 string                         |
| uuid                       | `UUID`; the system object identifier uses `ID`                   |
| json                       | `JSON`, JSON-compatible values only                              |
| enum                       | a generated GraphQL enum                                         |
| embedded object            | a generated output or input object                               |
| pointer                    | target object on output and target `ID` on input                 |
| relation                   | target connection on output and no direct mutation member        |
| one-dimensional field list | a list of the mapped element type                                |

Valid Core enum values that are valid non-reserved GraphQL enum names retain
their exact spelling. Every other value maps to
`VALUE_<SHA256_UTF8_HEX_IN_UPPERCASE>`. The compiler retains the exact reversible
map. A resulting duplicate value name is a startup error.

A plugin-defined logical field is exposed only when its owner attaches a JSON
wire codec for the canonical
`ultimabase.graphql.field@1.0.0` protocol. GraphQL uses that codec's `decode`
for inputs and filter operands and `encode` for outputs. V1 represents the
encoded value as `JSON`, or `[JSON!]` for a list. It never guesses from field
kind, options, storage codecs, REST codecs, or adapter values. A missing or
throwing codec fails schema compilation or produces a masked execution error,
respectively. A future typed custom scalar protocol requires a separate ADR;
v1 does not accept executable scalar implementations through Core metadata.

### Relay connections are signed offset cursors owned by GraphQL

Collection and relation fields use the Relay Cursor Connections shape:

```graphql
type PostConnection {
	edges: [PostEdge!]!
	nodes: [Post!]!
	pageInfo: PageInfo!
}

type PostEdge {
	cursor: String!
	node: Post!
}

type PageInfo {
	hasNextPage: Boolean!
	hasPreviousPage: Boolean!
	startCursor: String
	endCursor: String
}
```

`first` is a non-negative GraphQL `Int`, defaults to 25, and cannot exceed 100.
`after` is optional. Reverse arguments `last` and `before` do not exist in v1.
If ordering is omitted, GraphQL uses `id ASC`. If supplied, GraphQL preserves
the declared order and appends `id ASC` as a deterministic tie-breaker unless
`id` is already present.

Each edge cursor is
`base64url(canonical-json-utf8).base64url(hmac-sha256)` using unpadded base64url
segments. The payload contains only:

- cursor protocol version `1`;
- the next zero-based Core offset;
- the generated schema type and relationship path;
- a SHA-256 fingerprint of the normalized GraphQL wire where expression and
  effective ordered field/direction list.

Relation cursors additionally retain the exact generated relationship path but
not a source object ID. One eager Core inclusion plan may page the same
relationship across several parent results whose IDs do not exist before
Runtime. Binding a cursor to one parent would therefore require a per-parent
resolver query or a transport cursor in Core. The signed path prevents a cursor
from selecting another relationship, while ordinary relation membership,
Access, ACL, and protected constraints remain enforced independently by Runtime.

An application-lifetime 32-byte random key signs cursors. The key is never
exported or logged. Consequently a cursor is valid only for the exact running
application instance, schema path, filter, and order that created it. Restart,
disposal, graph change, filter change, ordering change, another application,
malformed base64url, invalid JSON, an unknown version, an unsafe offset, or a
bad tag produces `GRAPHQL_INVALID_CURSOR` before Runtime execution. Cursors
have no separate clock expiry.

The decoded offset becomes only Core's existing `offset` clause. GraphQL fetches
at most `first + 1` rows, returns the first `first`, and uses the extra row for
`hasNextPage`. `hasPreviousPage` is true when the decoded offset is greater than
zero. Each returned edge cursor contains the following offset. `totalCount`
does not exist on v1 connections: root clients use the separately enabled
`countPost` field, and relation connections do not trigger a hidden per-parent
count query.

Because this is offset pagination, committed insertion or deletion before the
current position may cause a later page to skip or repeat a row. The signed
cursor provides integrity and context binding, not a snapshot or keyset
guarantee. Core gains no cursor codec, cursor AST node, implicit ordering, or
pagination response metadata.

### Explicit plugin operations use one typed inert GraphQL binding

GraphQL defines the canonical Core operation transport
`ultimabase.graphql.operation@1.0.0`. An operation becomes a root field only
when all of these are true:

1. its owner declared the operation and an exact GraphQL wire codec;
2. the owner holds active `transport:expose` privilege;
3. the binding carries valid GraphQL metadata for the canonical protocol;
4. `graphqlPlugin({ operations })` contains that exact operation token.

Declarations and installed bindings never auto-expose an operation. Core's
application operation transport remains the only executor and preserves exact
owner attribution, input validation, transaction policy, cancellation, and
safe declared failures.

The binding metadata is immutable JSON. It names `query` or `mutation`, one
valid root field, an optional single argument named `input`, its type reference,
the result type reference, and ordered supporting type definitions. Supporting
definitions are a closed, callback-free IR for object, input-object, and enum
types whose fields reference GraphQL built-ins, GraphQL v1 scalars, another
supporting definition, or an exact application schema type. They cannot define
schema roots, directives, resolvers, unions, interfaces, or executable scalars.
The binding codec alone converts the complete input and result wire values.
Malformed references, duplicate definitions, unreachable definitions, and all
collisions fail startup.

Password Auth is the first proof. When its four exact operation tokens are in
the application allowlist, its owner-provided bindings add:

```graphql
input PasswordAuthCredentialsInput {
	username: String!
	password: String!
}

type PasswordAuthPrincipal {
	userId: ID!
}
type PasswordAuthSession {
	id: ID!
	token: String!
	expiresAt: DateTime!
	absoluteExpiresAt: DateTime!
}
type PasswordAuthPayload {
	principal: PasswordAuthPrincipal!
	session: PasswordAuthSession!
}
type PasswordAuthLogoutPayload {
	revoked: Boolean!
}

type Mutation {
	signUp(input: PasswordAuthCredentialsInput!): PasswordAuthPayload!
	login(input: PasswordAuthCredentialsInput!): PasswordAuthPayload!
	refresh: PasswordAuthPayload!
	logout: PasswordAuthLogoutPayload!
}
```

The GraphQL wire codec emits only `userId`, never the returned User model or
its custom fields. The one-time session token remains present in successful
sign-up, login, and refresh results exactly as in the transport-neutral
operation contract. Logout and refresh read the already resolved session from
the active request context; no token argument exists. The three accepted
Password Auth failures keep their exact public codes in GraphQL error
extensions. GraphQL imports and identifies no authentication package.

### Error behavior is safe and transport-correct

Parse, document-validation, variable-coercion, input-codec, cursor, and
execution failures use ordinary GraphQL response errors. A safe framework or
plugin failure exposes only its public message and:

```ts
extensions: {
	code: string
	retryable: boolean
	requestId: string
	details?: JsonValue
}
```

Only already-public JSON details are copied. Unknown errors become message
`Unexpected error.`, code `INTERNAL_SERVER_ERROR`, and `retryable: false`.
Stacks, causes, SQL, callbacks, paths on disk, plugin options, owner provenance,
policy reasoning, credentials, authority, cursor keys, and internal details are
never serialized. Diagnostics may retain internal facts through the existing
server-side sink.

GraphQL request errors return no `data`. Resolver errors may return partial
`data` according to GraphQL null propagation. Policy-driven omitted model
fields become null without an error as described above. A resolver cannot turn
a transport error shape, extension, variable, or context lookalike into a Core
authority or grant.

### Custom schemas compose only through GraphQL-owned boundaries

`graphqlPlugin({ schemas })` accepts an immutable ordered array of completed
`GraphQLSchema` values owned by the application declaration. The package also
exports a GraphQL-specific multiple application capability and provider helper
for a plugin that intentionally depends on the GraphQL package. This is not a
Core registry and creates no optional Core vocabulary. The contribution
capability requires `transport:expose` from each plugin provider because its
resolvers and types can become public.

Contributions are ordered by plugin dependencies, plugin configuration, then
owner-local registration. The generated schema comes first, direct application
schemas follow in array order, and plugin contributions follow their resolved
graph order. GraphQL Tools `mergeSchemas` may perform the final standard merge,
but a deterministic preflight owns conflicts:

- root fields and fields on object, interface, and input types must be unique;
- distinct fields may extend an existing compatible object, interface, or input
  type;
- enum values and union members may be added but a duplicate is rejected;
- custom scalars and directives have one owner and cannot be replaced;
- a type-kind mismatch, resolver overwrite, or duplicate schema definition is
  always an error.

Standard specified scalars and directives are shared by identity and excluded
from ownership conflicts. The merge creates a new final application-local
schema; later mutation of a contributed schema cannot change it. The final
schema has no mutable global registry and is released on application disposal.
Every resolver is wrapped before merging: application option resolvers execute
under application attribution and plugin contributions execute under their
exact plugin and optional instance owner. A contributed callback never borrows
the GraphQL host plugin's privileges.

Custom resolver context is exactly:

```ts
interface UltimaBaseGraphqlContext {
	readonly request: RequestContext
}
```

The real application-bound context is immutable. It exposes its existing safe
request values, current access mode, and cancellation signal, not an
application, `UltimaBase`, `FrameworkEngine`, `RequestEngine`, request executor,
credential, grant, authority mutation facade, adapter, transaction, privilege,
raw HTTP request, or lifecycle control.
Resolvers may use ordinary application Schema and operation handles inside the
active request scope. Generated resolvers privately use only the narrow
application request executor.

V1 adds no framework DataLoader. Generated pointer and relation selections
normalize to Core's eager inclusion contract, whose adapter implementation
already prevents per-parent loading while retaining policy-aware target plans.
A custom schema may construct its own request-local batching inside a resolver,
but it owns its keys, cache, disposal, and correctness and must execute through
ordinary application APIs. UltimaBase never shares a loader across requests or
offers a loader that could bypass Runtime.

### Networkless execution is the authoritative GraphQL behavior

The GraphQL plugin setup export returned by
`application.getPlugin('@ultimabase/graphql-plugin')` contains:

```ts
interface GraphqlPluginExports {
	readonly schema: GraphQLSchema
	execute(options: {
		readonly context: RequestContext
		readonly document: string | DocumentNode
		readonly operationName?: string
		readonly variables?: Readonly<Record<string, unknown>>
	}): Promise<ExecutionResult>
	printSchema(): string
}
```

`execute` requires a real context already bound to the same started
application. Foreign, forged, stale, cancelled, or disposed contexts fail
before resolver work. It enters that exact Core asynchronous scope for the
whole GraphQL execution. The executor never accepts application IDs, raw
credentials, Master flags, authority objects, HTTP headers, or arbitrary
resolver context values.

Trusted server code creates or derives anonymous, authenticated, and audited
Master contexts outside the GraphQL document and passes only the resulting
context. A session wrapper may pass `getCurrentRequest()` from its active
scope. Master credentials are verified by the application authority before
GraphQL execution; they never appear in arguments, variables, extensions, or a
resolver-created object.

Anonymous networkless execution uses an application-owned context:

```ts
const graphql = ultimabase.application.getPlugin('@ultimabase/graphql-plugin')
const anonymous = ultimabase.engine.anonymous({
	requestId: randomUUID(),
	source: requestSources.internal,
}).context

await graphql.execute({
	context: anonymous,
	document: `query { findManyPost(first: 10) { nodes { id title } } }`,
})
```

Password Auth derives session identity before GraphQL and passes no token to
the document:

```ts
const auth = ultimabase.application.getPlugin(
	'@ultimabase/password-auth-plugin',
)

await auth.runWithSession(sessionToken, () =>
	graphql.execute({
		context: getCurrentRequest(),
		document: `mutation { logout { revoked } }`,
	}),
)
```

Trusted Master execution verifies and audits the server-owned credential before
calling GraphQL:

```ts
const request = ultimabase.engine.anonymous({
	requestId: randomUUID(),
	source: requestSources.internal,
})
const grant = ultimabase.engine.authorizeMasterKey(env.ULTIMABASE_MASTER_KEY)
const master = await request.useMasterKey(grant, 'GraphQL maintenance export')

await graphql.execute({
	context: master.context,
	document: `query { findManyPost(first: 100) { nodes { id title } } }`,
})
```

The equivalent Yoga request receives identity only from HTTP's selected
application and credential boundary:

```ts
await fetch('https://api.example.test/graphql', {
	method: 'POST',
	headers: {
		accept: 'application/graphql-response+json',
		authorization: `Bearer ${sessionToken}`,
		'content-type': 'application/json',
		'x-ultimabase-application-id': 'notes',
	},
	body: JSON.stringify({
		query: `query { findManyPost(first: 10) { nodes { id title } } }`,
	}),
})
```

An enabled HTTP Master request uses the server-owned
`X-UltimaBase-Master-Key` header instead of the Bearer header. Neither header is
forwarded to Yoga or made visible to resolvers.

`printSchema()` returns a lexicographically sorted SDL snapshot of the final
public schema. It contains no resolver implementation, cursor secret,
credential, private record, plugin option, privilege decision, or owner
diagnostic. Networkless execution and schema printing do not require HTTP,
Yoga, Hono, Typegen, or a generated client.

Both string and parsed documents pass the same validation and safety checks.
String documents additionally enforce source bytes and lexer tokens; parsed
documents enforce a matching maximum of 10,000 AST nodes because their original
source need not exist. Defaults are 100 KiB of UTF-8 source, 10,000 lexer tokens
or AST nodes, depth 20, 100 aliases, 20 root response fields, 1 MiB of
JSON-compatible variables, connection default 25, and connection maximum 100.
`graphqlPlugin({ limits })` accepts positive safe-integer overrides, except the
non-negative default page size, and requires the default page size not to exceed
the maximum. Cyclic variables, non-plain variable maps, unsupported directives,
and documents exceeding a configured limit fail before Runtime.

### Yoga adapts one selected HTTP request

`graphqlYogaPlugin()` accepts exactly `path`, `bodyLimit`, and `introspection`.
The path defaults to `/graphql` and is absolute and normalized without query,
fragment, empty segment, or trailing slash. V1 contributes one HTTP mount whose
only GraphQL request method is `POST`; every other method returns 405 with
`Allow: POST` after that mount is selected. Multipart, batch arrays, WebSocket,
and server-sent-event GraphQL requests are not accepted. Explorer GET routes
belong only to separate explorer plugins.

The handler accepts `Content-Type: application/json` with UTF-8 JSON and an
object containing only `query`, `operationName`, `variables`, and `extensions`.
`query` is required and is a string; `operationName` is string or null;
`variables` is a plain object or null. `extensions` is null, absent, or an empty
plain object in v1; a non-empty value is rejected because persisted queries and
other protocol extensions are unsupported. The default streamed body limit is
1 MiB and may be lowered or raised through a positive safe-integer `bodyLimit`.

The request `Accept` header may be absent or include `*/*`,
`application/graphql-response+json`, or legacy `application/json`. The response
uses the supported media type with the highest positive quality value, breaking
a tie in favor of `application/graphql-response+json`; an absent header or
`*/*` also selects that GraphQL response media type. Legacy-only requests use
`application/json; charset=utf-8`. No acceptable type produces 406. Invalid
method, content type, body size, JSON, or GraphQL request shape produces the
appropriate safe 4xx response. GraphQL parse, validation, and variable failures
use 400; a successfully parsed and validated execution response uses 200 even
when field errors exist. Responses use `Cache-Control: no-store`.

HTTP selects one exact application from
`X-UltimaBase-Application-Id`, creates the request ID and cancellation signal,
resolves session context, and optionally exchanges the selected application's
enabled raw Master header before the Yoga endpoint begins. Yoga receives the
already selected context through the endpoint's active Core scope. It does not
read sensitive headers or select, clone, elevate, or decorate that context.
Abort and deadline signals are checked before parsing, before execution, and by
every Runtime call; custom resolvers receive the same signal.

Application-selection, duplicate-sensitive-header, context-resolver,
credential, and Master failures remain HTTP pre-dispatch errors. Once the
selected Yoga handler begins, media, GraphQL, resolver, and Runtime errors use
this ADR's GraphQL boundary. CORS and preflight remain entirely HTTP-owned and
invoke no GraphQL behavior.

Yoga's built-in GraphiQL and landing page are always disabled. Introspection is
enabled for trusted networkless execution and disabled by default over Yoga.
Yoga enables it only through explicit `introspection: true`; it never infers
security behavior from `NODE_ENV`. Introspection is tooling exposure, never an
authorization substitute. Separate GraphiQL and Apollo Sandbox plugins may add
their own routes later and are absent unless installed.

### V1 non-goals are explicit

V1 rejects GraphQL subscriptions, live queries, federation, uploads,
multipart incremental delivery, persisted queries, Automatic Persisted
Queries, `@defer`, `@stream`, custom protocol extensions, schema registry
publishing, client generation, policy-specific schema rewriting, and reverse
cursor pagination. It also rejects a generic Core GraphQL registry, a Core
cursor abstraction, implicit operation exposure, automatic Yoga/Core nesting,
and framework-owned DataLoader.

These features require later evidence and contracts. Their absence does not
reserve public options, directives, capabilities, storage, or placeholder
packages.

## Consequences

- ADR-0010's network-independent GraphQL, optional Yoga adapter, completed
  custom schema, and separate explorer decisions remain accepted.
- ADR-0010's automatic GraphQL installation by Yoga is replaced by explicit
  sibling configuration.
- Every generated and plugin operation reaches the existing application request
  capability and canonical Runtime semantics.
- Nullable model output fields preserve sound behavior under unknown dynamic
  policy restrictions at the cost of weaker static non-null guarantees.
- Signed offset cursors provide opaque Relay navigation but intentionally
  inherit offset pagination's concurrent-change behavior and expire on restart.
- Plugin fields remain portable without widening Core, though v1 exposes their
  owner-encoded values as `JSON` rather than invented typed scalars.
- Typed plugin-operation metadata remains inert JSON and requires no dependency
  from operation owners to the GraphQL package.
- Generated relation inclusion reuses the existing adapter-aware batching
  boundary; no second caching or authority surface is introduced.

## References

- GraphQL specification, September 2025: <https://spec.graphql.org/September2025/>
- GraphQL over HTTP working draft: <https://graphql.github.io/graphql-over-http/draft/>
- Relay Cursor Connections specification: <https://relay.dev/graphql/connections.htm>
- GraphQL Tools schema merging: <https://the-guild.dev/graphql/tools/docs/schema-merging>
- GraphQL Yoga: <https://the-guild.dev/graphql/yoga-server>
