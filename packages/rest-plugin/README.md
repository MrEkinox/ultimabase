# `@ultimabase/rest-plugin`

`@ultimabase/rest-plugin` owns the experimental REST route graph, schema
request boundary, and Fetch response contract. It generates immutable
application-local metadata under `/api` by default, contributes an owned
mount to `@ultimabase/http-plugin`, decodes accepted reads and mutations into
Core's existing Query and schema-command contracts, and delegates them through
Core's narrow application request executor. It does not import Hono, start
listeners, access an adapter, or retain request data in an AST.

The repository includes a [runnable Hono and PostgreSQL example](../../examples/minimal/README.md)
with anonymous and authenticated sessions, role-protected REST, audited Master
access, and public plugin operations.

## Installation

```ts
import { UltimaBase } from '@ultimabase/core'
import { accessPlugin } from '@ultimabase/access-plugin'
import { httpPlugin } from '@ultimabase/http-plugin'
import { restPlugin } from '@ultimabase/rest-plugin'

const Application = UltimaBase.use(accessPlugin())
	.use(httpPlugin({ appId: 'blog' }))
	.use(
		restPlugin({
			basePath: '/api',
			bodyLimit: 2_097_152,
			openapi: true,
			pagination: { defaultTake: 100, maxTake: 1_000 },
		}),
	)
const Post = Application.Schema.define({
	className: 'Post',
	fields: (field) => ({ title: field.string() }),
}).with({ rest: { count: true, upsertOne: true } })
const ultimabase = new Application({
	schemas: [Post],
})
```

`.with({ rest })` is typed only because this factory installed `restPlugin()`;
no Typegen run is needed. Its keys are the schema method names (ADR-0324):
`findMany`, `findOne`, `count`, `exists`, `createOne`, `updateOne`,
`deleteOne`, `upsertOne`, `createMany`, `updateMany`, `deleteMany`,
`upsertMany`, and the plugin commands REST can expose on that schema, such as
`softDeleteOne`. Defining the schema remains inert: only `schemas: [Post]`
registers it. An omitted method inherits the plugin `default`, then the
built-in default: `findMany`, `findOne`, `exists`, `createOne`, `updateOne`
and `deleteOne` are on; `count`, `upsertOne`, the `…Many` methods and every
plugin command are off. `rest: true` exposes every method and command,
`rest: false` none. The old-form `define({ rest })` keeps the same keys through
Typegen until that form is removed.

| Method key   | Route below the base path                               |
| ------------ | ------------------------------------------------------- |
| `findMany`   | `GET /classes/{Schema}`, `POST /classes/{Schema}/query` |
| `findOne`    | `GET /classes/{Schema}/{id}`, `GET\|POST …/first`       |
| `count`      | `GET\|POST /classes/{Schema}/count`                     |
| `exists`     | `GET\|POST /classes/{Schema}/exists`                    |
| `createOne`  | `POST /classes/{Schema}`                                |
| `updateOne`  | `PATCH /classes/{Schema}/{id}`                          |
| `deleteOne`  | `DELETE /classes/{Schema}/{id}`                         |
| `upsertOne`  | `POST /classes/{Schema}/upsert`                         |
| `createMany` | `POST /classes/{Schema}/bulk/create`                    |
| `updateMany` | `POST /classes/{Schema}/bulk/update`                    |
| `deleteMany` | `POST /classes/{Schema}/bulk/delete`                    |
| `upsertMany` | `POST /classes/{Schema}/bulk/upsert`                    |

Plugin-owned schemas are always private from generated REST CRUD routes. A
plugin-owned schema that declares `rest` is rejected because storage ownership
cannot be converted into public exposure.

## Base path and protocol version

The default base path is `/api` (`/api/classes/Todo`, `/api/auth/login`). It
carries no protocol version: every REST response carries
`X-UltimaBase-Rest-Version: 1`, and a future wire format would be chosen by an
option, never by the URL. `basePath` is free, so `/api/v1` versions the
application's own API. `/` mounts REST at the root. The health route stays at
HTTP's `/health`.

## Public writes

Generated routes are public exposure, not authorization. REST refuses to
start when it would expose a write (create, update, delete, upsert, bulk or a
plugin command) while no protected policy plugin is installed, with a message
naming both ways forward: install a policy such as `accessPlugin()`, or pass
`restPlugin({ publicWrites: true })` to let every client write (ADR-0294).
Access's `allowWithoutRule` openings are explicit policies. Read-only routes
need neither. REST logs one `warn` line, prefixed with
`[@ultimabase/rest-plugin]`, when it exposes no schema or operation, and when
it has routes but no HTTP plugin to serve them.

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

## Public operations

An operation is public only when its owner declares it (ADR-0324):
`contributeOperation({ operation, execute, public: { name: 'login' } })`.
Every installed transport exposes it; an operation not declared public is
never exposed. The application hides some per instance:

```ts
restPlugin({ hide: [authOperations.refresh] })
```

A hidden token that is not a public operation of the application fails at
startup. Each exposed operation receives `POST /api/operations/{public name}`
and accepts exactly `{ "input": value }`.

An owner may contribute a REST binding through Core: a logical-to-wire codec
for the canonical `ultimabase.rest@1.0.0` protocol, which it names without
importing this package, so REST and other plugins stay siblings. Its metadata
contains `errors: { [declaredPublicErrorCode]: httpStatus }`, including an
empty object when the operation declares no public plugin errors, and an
optional `path`: `{ errors, path: "/auth/login" }` produces
`POST /api/auth/login`. The prefix follows the configured `basePath`. Only
static slash-separated ASCII letters, digits, underscores, and hyphens are
accepted, with a leading slash and no trailing slash. The `classes` and
`operations` roots are reserved. Templates, percent encoding, dot segments,
queries, fragments, and additional metadata keys are rejected. No old-path
alias is registered, and collisions fail before startup.

Without a REST binding, REST passes the wire input to the operation's own
input contract (a rejected value is a `VALIDATION_ERROR`) and maps each
declared public error to `400`.

An operation binding may also declare `inputSchema` naming a schema owned by
that exact plugin. REST then applies the schema's ordinary nested-create field
codecs to the input before the owner decodes it. This does not expose schema
CRUD routes or run validation/defaults outside Runtime.

REST reads these inert facts through Core's transport planner during route
compilation. It validates the complete mapping before transport startup and
accepts only integer error statuses from 400 through 599. The
`RestOperationTransport` setup export then executes only its own route objects
through Core's existing operation Runtime. Operation codecs may return nested
plain results from the selected application. REST serializes operation outputs
with Core's `toJSON` (ADR-0310), including bigint and binary values. It does
not load additional fields or relationships. JSON fields themselves remain
strict JSON; foreign schema models are rejected.

An HTTP success returns `200` with `{ result }`; a declared `PluginError` uses
the configured status of that operation. It preserves anonymous contexts,
plugin-owned values, verified Master provenance, transactions, middleware,
protected constraints, cancellation, and application isolation. Wire input
cannot select authority, adapters, plans, privileges, or another operation.

## Application operations

`defineOperation` from `@ultimabase/plugin-kit` declares an application
operation without writing a plugin, with Standard Schema validators:

```ts
const createInvoice = defineOperation({
	name: 'createInvoice',
	input: z.object({
		customer: z.string().min(2),
		amount: z.number().positive(),
	}),
	output: z.object({ invoice: z.string() }),
	handler: async ({ input }) => ({ invoice: await bill(input) }),
})
const Application = UltimaBase.use(httpPlugin(), restPlugin(), createInvoice)
```

It is public: REST exposes `POST /api/operations/createInvoice`, derives the
OpenAPI request and response bodies from the validators, and answers `422`
`VALIDATION_ERROR` with `details.issues` (paths start with `input`) when the
input validator rejects a value.

## OpenAPI

`restPlugin({ openapi: true })` serves `GET {basePath}/openapi.json`, an OpenAPI
3.1 document of the routes this instance exposes: paths, parameters, request
and response bodies, the `{Schema}`, `{Schema}CreateInput` and
`{Schema}UpdateInput` components with each field's wire type, and the
constraints that validators describe as JSON Schema (a Standard JSON Schema
validator in a field option such as Validation's `validation`, and the
validators of an application operation). No access rule is revealed. The
document is built once, on its first request.

## Plugin-owned schema mutations

A plugin command REST can expose (request authority, one row named by `id`)
receives a route only when the schema's rule names it, as
`.with({ rest: { softDeleteOne: true } })`, or when the rule or the plugin
default is `true`. REST derives the schema-local route from the compiled
graph:

```text
POST /api/classes/{Schema}/{id}/{command-kebab-case}
```

The bounded JSON body accepts only optional `input`, `select`, and `include`
properties. For example, a command named `archivePost` receives:

```json
{
	"input": { "reason": "superseded" },
	"select": { "id": true, "title": true, "workflowState": true }
}
```

A command owner may bind its private payload decoder and the complete HTTP
status mapping of its declared public errors to `ultimabase.rest@1.0.0`;
without a binding, REST passes `input` to the command's own input contract and
maps each declared error to `400`. Core continues to own the target ID,
schema, context, selection, inclusion, result materialization, transaction,
policy, Hooks, and persistence plan. REST receives only inert route metadata
and a late-bound executable allowlist; a mutation cannot be invoked through
the generic `/operations` endpoint. Master-only and many-row commands are
never generated as REST routes. Success returns `200` with `{ result }`, using
the schema's existing REST field codecs.

## Read normalization

`normalizeRestReadRequest(schema, input, limits)` accepts the route-selected
native read operation and a Fetch `Request`. GET parameters and complex POST
bodies converge on `normalizeReadOperation()` in Core, so fields, operators,
relationships, projections, ordering, `take`, `skip`, and `after` retain the
same AST semantics as the TypeScript API. `where` as JSON is the only filter form: there are no
per-field URL filters, which would collide with the reserved parameters. Collection reads default to
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
GET /api/classes/Post?select=id,displayTitle
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
route matching, content negotiation, normalization, Runtime, field encoding,
and its `REST_*` failures.

Every response is JSON with `Content-Type: application/json; charset=utf-8`
and `X-UltimaBase-Rest-Version: 1`.
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

A client error locates its cause in `details: { parameter, path, reason }`
(ADR-0324): `parameter` is the query parameter, `id`, `query` or `body` (or a
body key such as `where`, `create`, `data`, `input`), `path` the location
inside it, and `reason` the expected value in words, for example
`{ "parameter": "where", "path": ["views", "gt"], "reason": "must be a safe integer" }`.
Value failures that only Core detects name the parameter with Core's message
and an empty path. The exposed schema is public, so these details reveal
nothing a client could not read from the OpenAPI document.

Malformed input returns `400`; permission and Master denials return `403`;
missing routes and targets return `404`; a method a route or an exposed
schema does not allow returns `405` with an `Allow` header
(`REST_METHOD_NOT_ALLOWED`); unacceptable representations return `406`;
unique, reference and transient transaction conflicts (`UNIQUE_VIOLATION`,
`REFERENCE_VIOLATION`, `TRANSACTION_CONFLICT`) return `409`; oversized bodies
return `413`; unsupported media returns `415`; validation returns `422`; and
unexpected failures return `500`. HTTP-owned application or credential
rejection remains `401`, while its deadline boundary remains `408`. A schema
without any route answers `404`, so a hidden schema is not revealed.

`Accept` may be absent or select `application/json` through its exact media type
or a wildcard. An explicit quality of zero rejects the representation with
`REST_NOT_ACCEPTABLE`.

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

A plugin-defined scalar must attach an exact REST codec before a schema that
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
