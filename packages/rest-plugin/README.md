# `@ultimabase/rest-plugin`

`@ultimabase/rest-plugin` owns the experimental REST v1 route graph and schema
request boundary. It generates immutable application-local metadata under
`/api/v1` by default, decodes accepted reads and mutations into Core's existing
Query and schema-command contracts, and delegates them through Core's narrow
application request executor. It does not import Hono, start listeners, access
an adapter, or retain request data in an AST.

## Installation

```ts
import { Schema, UltimaBase } from '@ultimabase/core'
import { httpPlugin } from '@ultimabase/http-plugin'
import { restPlugin } from '@ultimabase/rest-plugin'

const Post = Schema.define({
	className: 'Post',
	rest: { count: true, upsert: true },
	fields: (field) => ({ title: field.string() }),
})

const ultimabase = new UltimaBase({
	plugins: [
		httpPlugin({ appId: 'blog' }),
		restPlugin({
			acknowledgeUnverifiedProtection: true,
			basePath: '/api',
			bodyLimit: 1_048_576,
			maxLimit: 1_000,
		}),
	],
	schemas: [Post],
})
```

The `rest` schema option is available only when the plugin contributes it to
the compiled application graph. Omitted operation properties inherit the
plugin default and then the provenance-aware built-in default. Application
schemas enable find, get, first, exists, create, update, and delete by default;
count, upsert, and all bulk routes remain disabled.

Plugin-owned schemas are always private from generated REST CRUD routes. A
plugin-owned schema that declares `rest` is rejected because storage ownership
cannot be converted into public exposure.

## Route metadata

The setup export exposes one `RestRouteGraph` shared by every explicit REST
instance in the application. Each route retains its schema contribution,
plugin instance, application compilation, method, path, logical operation, and
protocol version. Item paths contain inert `{id}` metadata; request matching
belongs to the later execution boundary, while read normalization validates the
captured item value as UUID v7.

Two explicit instances use `instanceId`. Distinct base paths compose into one
graph, while matching methods and paths fail with a deterministic collision
diagnostic.

## Plugin operations

Operation declarations remain private unless the application selects their
exact tokens explicitly:

```ts
restPlugin({
	acknowledgeUnverifiedProtection: true,
	operations: [loginOperation],
})
```

Each selected application operation receives
`POST /api/v1/operations/{namespacedOperation}` and accepts exactly
`{ "input": value }`. The owner contributes its logical-to-wire codec and a
REST v1 binding through Core. It can independently name the canonical
`ultimabase.rest@1.0.0` protocol without importing this package, which keeps
REST and future Password Auth as siblings.

The binding metadata must be exactly
`{ errors: { [declaredPublicErrorCode]: httpStatus } }`, including an empty
object when the operation declares no public plugin errors. REST validates the
complete mapping before transport startup and accepts only integer error
statuses from 400 through 599. The `RestOperationTransport` setup export then
executes only its own route objects through Core's existing operation Runtime.
It preserves anonymous contexts, plugin-owned values, verified Master
provenance, transactions, middleware, protected constraints, cancellation,
and application isolation. Wire input cannot select authority, adapters,
plans, privileges, or another operation.

Generated routes are public exposure, not authorization. Access, ACL,
authentication, and Master authority are configured independently. Unless the
developer passes `acknowledgeUnverifiedProtection: true`, starting an
application with generated routes uses Core's shared
`UNVERIFIED_PUBLIC_TRANSPORT_PROTECTION` diagnostic.

## Read normalization

`normalizeRestReadRequest(schema, input, limits)` accepts the route-selected
native read operation and a Fetch `Request`. GET parameters and complex POST
bodies converge on `normalizeReadOperation()` in Core, so fields, operators,
relationships, projections, ordering, offsets, and limits retain the same AST
semantics as the TypeScript API. Collection reads default to 100 results and
reject limits above 1000 unless `restPlugin({ maxLimit })` supplies another
application-local maximum.

POST reads require `application/json` with an optional UTF-8 charset. The body
is counted while its stream is consumed; `Content-Length` is validated as a
hint and checked against the observed byte count, but never trusted as the
enforcement boundary. The default maximum is 1 MiB and `bodyLimit` changes it.
Malformed requests throw `RestReadNormalizationError` with a stable safe code;
raw parser or Core diagnostics are not retained.

## Read execution

`executeRestReadRequest(executor, context, schema, input, limits)` composes that
normalization boundary with `ApplicationRequestExecutor.executeRead`. Find,
first, get, count, and exists therefore retain the same Access, ACL, protected
not-found, inclusion, projection, materialization, Master, and cancellation
semantics as direct Query execution. Count and exists remain their exact Core
operations rather than being emulated through item reads.

The function returns a logical Core result. REST response envelopes, field
encoding, route dispatch, and post-dispatch error mapping remain separate later
boundaries. The Fetch request and application context must originate from the
same HTTP request lifetime so normalization and Runtime observe its composed
cancellation/deadline signal.

## Mutation normalization and execution

`normalizeRestMutationRequest(schema, input, limits)` accepts create, update,
delete, upsert, and their homogeneous bulk forms. Create and update retain the
concise REST bodies fixed by ADR-0228; upsert and bulk retain the corresponding
schema-command wrappers. Item update and delete require the route-captured UUID
v7 identifier. Only create and update accept `select` and `include` query
parameters, delete accepts `select`, and upsert or bulk projections remain in
their JSON bodies.

Schema-aware decoding converts bigint strings, binary tags, pointer tags,
embedded values, lists, plugin-field codecs, and numeric increment/decrement
tags into their exact Core values. Relation handles remain non-writable, while
Core continues to enforce system, generated, immutable, required, and unknown
field rules. Every non-empty mutation body requires JSON, is counted before
parsing, and treats `Content-Length` only as a checked hint. Item delete carries
no body.

`executeRestMutationRequest(executor, context, schema, input, limits)` delegates
the decoded command to `ApplicationRequestExecutor.executeMutation`. Direct and
REST callers therefore share mutation normalization, Access, ACL, Hooks,
Validation, protected constraints, persistence rewrites, transactions, results,
and events. Verified Master preserves validation and integrity work. Bulk stays
ordered, itemized, and atomic with no partial-success mode.

The function returns Core's logical model result. Response serialization,
envelopes, and transport error mapping remain the later response boundary.

## Plugin field codecs

A plugin-defined scalar must attach an exact REST v1 codec before a schema that
contains it can expose a route:

```ts
const color = definePluginField(
	'colors.value',
	{},
	{
		snapshotValue: normalizeColor,
		wireCodecs: [
			restFieldCodec({
				decode: decodeRestColor,
				encode: encodeRestColor,
			}),
		],
	},
)
```

The codec is nominally bound to REST v1, remains outside field metadata, and is
revalidated through the field's logical snapshot. REST never substitutes the
field's storage codec.

Protocol identity is canonical by exact name and version. Official ACL can
therefore attach its strict JSON REST codec without depending on this package;
installing REST and ACL together keeps both packages pointed toward Core.
