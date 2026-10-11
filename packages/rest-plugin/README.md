# `@ultimabase/rest-plugin`

`@ultimabase/rest-plugin` owns the experimental REST v1 route graph, schema
request boundary, and Fetch response contract. It generates immutable
application-local metadata under `/api/v1` by default, contributes an owned
mount to `@ultimabase/http-plugin`, decodes accepted reads and mutations into
Core's existing Query and schema-command contracts, and delegates them through
Core's narrow application request executor. It does not import Hono, start
listeners, access an adapter, or retain request data in an AST.

The repository includes a [runnable Hono and PostgreSQL example](../../examples/minimal/README.md)
with anonymous and Password Auth sessions, role-protected REST, audited Master
access, and explicitly exposed plugin operations.

## Installation

```ts
import { UltimaBase } from '@ultimabase/core'
import { httpPlugin } from '@ultimabase/http-plugin'
import { restPlugin } from '@ultimabase/rest-plugin'

const Application = UltimaBase.use(httpPlugin({ appId: 'blog' })).use(
	restPlugin({
		acknowledgeUnverifiedProtection: true,
		basePath: '/api',
		bodyLimit: 2_097_152,
		pagination: { defaultTake: 100, maxTake: 1_000 },
	}),
)
const Post = Application.Schema.define({
	className: 'Post',
	rest: { count: true, upsert: true },
	fields: (field) => ({ title: field.string() }),
})
const ultimabase = new Application({
	schemas: [Post],
})
```

`Application.Schema.define()` sees `rest` only because this factory installed
`restPlugin()`; no Typegen run is needed for that local option. Defining the
schema remains inert: only `schemas: [Post]` registers it. Omitted operation
properties inherit the
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

A schema route also exposes a frozen `virtualFields` map from field name to the
exact Core output descriptor. This metadata is response-only: it deliberately
omits resolver functions and their private persisted `select` dependencies.
Stored fields continue to use the schema metadata already identified by the
route. A plugin-owned output kind cannot be exposed until REST has an exact
representation for it, so route compilation rejects such a virtual output
instead of guessing a JSON encoding.

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

By default, each selected application operation receives
`POST /api/v1/operations/{namespacedOperation}` and accepts exactly
`{ "input": value }`. The owner contributes its logical-to-wire codec and a
REST v1 binding through Core. It can independently name the canonical
`ultimabase.rest@1.0.0` protocol without importing this package, which keeps
REST and Password Auth as siblings.

The binding metadata contains `errors: { [declaredPublicErrorCode]: httpStatus }`,
including an empty object when the operation declares no public plugin errors.
An optional `path` replaces the default operation URL: `{ errors, path:
"/auth/login" }` produces `POST /api/v1/auth/login`. The prefix follows the
configured `basePath`; the namespaced operation identity stays internal.
Only static slash-separated ASCII letters, digits, underscores, and hyphens
are accepted, with a leading slash and no trailing slash. The `classes` and
`operations` roots are reserved. Templates, percent encoding, dot segments,
queries, fragments, and additional metadata keys are rejected. No old-path
alias is registered, and collisions fail before startup.

An operation binding may also declare `inputSchema` naming a schema owned by
that exact plugin. REST then applies the schema's ordinary nested-create field
codecs to the input before the owner decodes it. This does not expose schema
CRUD routes or run validation/defaults outside Runtime.

REST reads these inert bindings through Core's existing transport planner
during route compilation. It validates the complete mapping before transport
startup and accepts only integer error statuses from 400 through 599.
The `RestOperationTransport` setup export then
executes only its own route objects through Core's existing operation Runtime.
Operation codecs may return nested plain results from the selected application.
REST serializes operation outputs with Core's `toJSON` (ADR-0310), including
bigint and binary values.
It does not load additional fields or relationships. JSON fields themselves
remain strict JSON; foreign schema models are rejected.

An HTTP success returns `200` with `{ result }`; a declared `PluginError` uses
the exact configured status from that operation's static binding.
It preserves anonymous contexts, plugin-owned values, verified Master
provenance, transactions, middleware, protected constraints, cancellation,
and application isolation. Wire input cannot select authority, adapters,
plans, privileges, or another operation.

Generated routes are public exposure, not authorization. Access, ACL,
authentication, and Master authority are configured independently. Unless the
developer passes `acknowledgeUnverifiedProtection: true`, starting an
application with generated routes uses Core's shared
`UNVERIFIED_PUBLIC_TRANSPORT_PROTECTION` diagnostic, a `warn` line of the
application logger (ADR-0313). REST also logs one `warn` line, prefixed with
`[@ultimabase/rest-plugin]`, when it exposes no schema or operation, and when
it has routes but no HTTP plugin to serve them.

## Plugin-owned schema mutations

An application-owned schema exposes each request-authority mutation that its
owner explicitly binds to `ultimabase.rest@1.0.0`. REST derives the schema-local
route from the compiled graph:

```text
POST /api/v1/classes/{Schema}/{id}/{command-kebab-case}
```

The bounded JSON body accepts only optional `input`, `select`, and `include`
properties. For example, a command named `archivePost` receives:

```json
{
	"input": { "reason": "superseded" },
	"select": { "id": true, "title": true, "workflowState": true }
}
```

The mutation owner supplies its private payload decoder and the complete HTTP
status mapping for its declared public errors. Core continues to own the target
ID, schema, context, selection, inclusion, result materialization, transaction,
policy, Hooks, and persistence plan. REST receives only inert route metadata and
a late-bound executable allowlist; a mutation cannot be invoked through the
generic `/operations` endpoint.

`rest: { mutations: false }` disables these routes for one schema, while
`rest: { mutations: true }` overrides a disabled plugin default. Omission
inherits `restPlugin({ default })`, then the built-in `true` mutation default.
Master-only mutations are never generated as REST routes. Success returns
`200` with `{ result }`, using the schema's existing REST field codecs.

## Read normalization

`normalizeRestReadRequest(schema, input, limits)` accepts the route-selected
native read operation and a Fetch `Request`. GET parameters and complex POST
bodies converge on `normalizeReadOperation()` in Core, so fields, operators,
relationships, projections, ordering, `take`, `skip`, and `after` retain the
same AST semantics as the TypeScript API. Collection reads default to
`take: 100` and reject a `take` above 1000 with `REST_READ_INVALID_INPUT`;
`restPlugin({ pagination: { defaultTake, maxTake } })` sets other values, with
the same option and defaults as `graphqlPlugin({ pagination })`. Server-side
`findMany` has no default `take`. `after` is the opaque cursor of a
previous page: REST decodes it with Core's shared encoder
(`@ultimabase/core/plugin`) for the request's `orderBy` and passes the position
to Core (ADR-0309).

POST reads require `application/json` with an optional UTF-8 charset. The body
is counted while its stream is consumed; `Content-Length` is validated as a
hint and checked against the observed byte count, but never trusted as the
enforcement boundary. Without `bodyLimit`, REST inherits `httpPlugin({ bodyLimit })`
(1 MiB by default), which the HTTP plugin enforces while the body streams;
`bodyLimit` replaces it for REST routes (ADR-0323).
Malformed requests throw `RestReadNormalizationError` with a stable safe code;
raw parser or Core diagnostics are not retained. An invalid `after` (malformed
cursor, another schema or ordering, or combined with `skip`) keeps Core's
public `VALIDATION_ERROR` with `details: { parameter: 'after' }`.

## Read execution

`executeRestReadRequest(executor, context, schema, input, limits)` composes that
normalization boundary with `ApplicationRequestExecutor.executeRead`. Find,
first, get, count, and exists therefore retain the same Access, ACL, protected
not-found, inclusion, projection, materialization, Master, and cancellation
semantics as direct Query execution. Count and exists remain their exact Core
operations rather than being emulated through item reads.

The function returns a logical Core result. The plugin's HTTP dispatcher wraps
collections in `{ results }`, singular values in `{ result }`, counts in
`{ count }`, and existence checks in `{ exists }`. The Fetch request and
application context originate from the same HTTP request lifetime so
normalization and Runtime observe its composed cancellation/deadline signal.

A collection route without `skip` answers `{ results, nextCursor }`. REST
reads one row more than `take`; `nextCursor` is the cursor of the last
returned row when that extra row exists, otherwise `null`. Pass it back as
`after` with the same `orderBy`. When `select` is explicit, REST also selects
the ordered fields and `id` so the cursor can be encoded, then removes the
fields the client did not ask for from the response. Cursors are unsigned and
stay valid across restarts and instances (ADR-0309).

A relation field's declared `where` is not REST syntax and is never serialized
to the client. Core resolves it from the selected application's real request
context, combines it with caller `where`, Access, ACL, protected constraints,
and physical membership, then applies relation ordering, `skip`, and `take`.
Relationship projections and parent `count` or `exists` predicates therefore
observe the same visible collection as a direct relation handle. Verified
Master bypasses authorization but retains this shaping unless the declaration
itself explicitly branches for Master.

Virtual fields use the same flat `select` syntax as stored result fields:

```text
GET /api/v1/classes/Post?select=id,displayTitle
```

REST passes that logical selection to Core unchanged. Core alone loads the
private dependencies, resolves the value (including asynchronous resolvers),
applies policy and structural output validation, and returns the materialized
model. Omitting `select` includes virtual fields in the complete result;
`{ "select": { "displayTitle": false } }` excludes one in a POST read.
Virtual names remain invalid in `where`, `orderBy`, relationship arguments, and
every direct or nested mutation data object.

REST field codecs run through Core's shared filter-input traversal before
canonical Query normalization. Nested logic, relationship predicates, filtered
counts, and structured paths therefore use one Core shape while REST retains
its strict JSON representations and `INVALID_REST_INPUT` boundary.

## Mutation normalization and execution

`normalizeRestMutationRequest(schema, input, limits)` accepts create, update,
delete, upsert, and their homogeneous bulk forms. Create and update retain the
concise REST bodies fixed by ADR-0228; upsert and bulk retain the corresponding
schema-command wrappers. Item update and delete require the route-captured UUID
v7 identifier, which becomes the command's `where: { id }` target (ADR-0307).
Only create and update accept `select` and `include` query
parameters, delete accepts `select`, and upsert or bulk projections remain in
their JSON bodies.

Singular create and update bodies accept the nested relationship commands of
ADR-0308 directly beside scalar fields. A pointer accepts `connect` or `create`
during create and additionally `update` during update; `null` unlinks an
optional pointer. A relation accepts `create` and `connect` during create and
additionally `update`, `disconnect`, or `set` during update, where `set: []`
removes every visible member. A hidden `connect`, `set` or `disconnect` target
answers 404 exactly like a missing one. Field-bound identities are UUID v7
strings, so mutation input no longer accepts the former tagged
`{ type: "pointer", className, id }` representation. Bulk and upsert inputs stay
flat and cannot carry relationship fields in this version.

```json
{
	"author": { "connect": "0199b4f0-5a31-7000-8000-000000000001" },
	"comments": {
		"create": [{ "body": "First" }],
		"connect": ["0199b4f0-5a31-7000-8000-000000000002"]
	}
}
```

Nested target data recursively reuses the target schema's bigint, binary,
embedded-object, list, and plugin-field codecs. A numeric field in update data
accepts `{ "increment": n }` or `{ "decrement": n }`, with the operand encoded
like the field's value (ADR-0307). REST preserves the declarative command
objects and delegates them through the application request executor; Core alone
normalizes the bounded graph, rejects conflicts and duplicate identities, and
executes its one transaction. Core also continues to enforce system, generated,
immutable, required, unknown-field, depth, and operation-count rules. Every
schema and nested-command traversal uses Core's shared mutation-data
transformer, while REST retains strict UUID-v7 identities, command allowlists,
JSON field codecs, and `INVALID_REST_INPUT` errors. Every
non-empty mutation body requires JSON, is counted before parsing, and treats
`Content-Length` only as a checked hint. Item delete carries no body.

`executeRestMutationRequest(executor, context, schema, input, limits)` delegates
the decoded command to `ApplicationRequestExecutor.executeMutation`. Direct and
REST callers therefore share mutation normalization, Access, ACL, Hooks,
Validation, protected constraints, persistence rewrites, transactions, results,
and events. Verified Master preserves validation and integrity work. Bulk stays
ordered, itemized, and atomic with no partial-success mode.

The function returns Core's logical model result. The HTTP dispatcher returns
`201` for create and bulk create, `200` for every other success, and preserves
the selected pre-delete model in `{ result }`.

## HTTP responses and safe errors

REST contributes one dispatcher at the configured base path when at least one
schema or plugin-operation route exists. HTTP still selects the exact
application, validates sensitive-header cardinality, resolves credentials, and
creates the request context before that dispatcher begins. Those earlier
failures keep the protocol-neutral `HTTP_*` envelope. Once selected, REST owns
path versioning, route matching, content negotiation, normalization, Runtime,
field encoding, and its `REST_*` failures.

Every response is JSON with `Content-Type: application/json; charset=utf-8`.
The HTTP application adds the final `X-UltimaBase-Request-Id` and
`Cache-Control: private, no-store` headers. Errors use
`{ error: { code, message, retryable, requestId, details? } }`. Only a
`FrameworkError` public payload, a declared operation `PluginError` or an
application `PublicError` (status `400`, ADR-0305) may retain its safe
message, details, and retryability. Unknown exceptions, internal details,
unrepresentable output, and undeclared or unmapped plugin errors become the
fixed non-retryable `REST_INTERNAL_ERROR` response and are logged with their
stack and request ID through the plugin logger (ADR-0313).

Mutation results obey the row read rules (ADR-0306): a client allowed to write
a row it cannot read requests the identifier alone, `?select=id` on create,
update and delete or `"select": { "id": true }` in an upsert or bulk body.

Malformed input and unsupported versions return `400`; permission and Master
denials return `403`; missing routes and targets return `404`; unacceptable
representations return `406`; unique, reference and transient transaction
conflicts (`UNIQUE_VIOLATION`, `REFERENCE_VIOLATION`, `TRANSACTION_CONFLICT`)
return `409`; oversized bodies return `413`; unsupported media returns `415`;
validation returns `422`; and unexpected failures return `500`.
HTTP-owned application or credential rejection remains `401`, while its
deadline boundary remains `408`.

`Accept` may be absent or select `application/json` through its exact media type
or a wildcard. An explicit quality of zero rejects the representation with
`REST_NOT_ACCEPTABLE`. Requests below the configured base path must select the
literal `v1` segment; another version returns `REST_UNSUPPORTED_VERSION`
instead of being guessed as a class route.

Schema values are encoded by declared field kind. Temporal, UUID, and decimal
values remain canonical strings; bigint becomes a base-10 string; binary uses
the tagged base64 object; unloaded pointers use their tagged identity; included
pointers and relations use recursively encoded selected models. Embedded
objects and lists recurse through the same codecs, explicit `null` survives,
and an absent model field stays absent. `undefined`, non-finite numbers, unsafe
integer output, cycles, and invalid plugin codec output are not representable.
Virtual values are encoded from their output descriptor through these same
canonical scalar, enum, temporal, decimal, binary, JSON, nullable, list, and
object representations. REST never executes a resolver or reads its dependency
selection.

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
