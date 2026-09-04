# ADR-0228: Experimental HTTP and REST v1 wire contract

- Status: accepted
- Date: 2026-09-04
- Refines: ADR-0004, ADR-0009, ADR-0042, ADR-0193, ADR-0209, ADR-0224, ADR-0225, ADR-0226, ADR-0227
- Depends on: ADR-0164, ADR-0181, ADR-0193, ADR-0209, ADR-0224, ADR-0225, ADR-0226, ADR-0227

## Context

REST route generation creates a public compatibility surface before any client
SDK can hide protocol inconsistencies. The first contract must preserve the
existing Query and Operation AST, optional Access and ACL engines, application
ownership, audited Master authority, and item-oriented atomic mutations.

Parse Server provides the desired approachable baseline: class-oriented paths,
JSON requests, application identity headers, query parameters, and collection
responses under `results`. UltimaBase is not a Parse-compatible server,
however. It has static TypeScript schemas, exact logical operations, explicit
plugin ownership, UUID v7 object identifiers, and one transport-independent
Runtime pipeline.

The contract must also close boundaries that a normalized Fetch `Headers`
object cannot prove by itself: duplicate sensitive headers, streamed body size,
application selection, and safe failures before a REST handler begins.

## Decision

### REST v1 is explicitly versioned

`restPlugin()` uses `/api` as its default base path and always appends the fixed
`v1` protocol segment. The resulting default root is `/api/v1`. A configured
base path must be an absolute normalized path without a trailing slash and
cannot contain the version segment. REST v1 has no version-negotiation header
or unversioned alias.

An unsupported version below the configured base path fails explicitly rather
than being interpreted as a class or another protocol. Future incompatible
wire behavior uses another path version and does not silently alter v1.

Schema class names remain exact and case-sensitive. REST neither pluralizes nor
changes their case. The class name and namespaced operation name are encoded as
one canonical RFC 3986 path segment and decoded exactly once. Non-canonical,
malformed, or multiply encoded segments are rejected.

### Application schemas declare their REST surface directly

The REST plugin contributes one direct `rest` schema option. It is recognized
only when `restPlugin()` is installed; using it without that plugin is a schema
compilation error like every other unresolved direct plugin option.

```ts
const Post = Schema.define({
	className: 'Post',
	rest: {
		count: true,
		upsert: true,
	},
	fields: (field) => ({
		title: field.string(),
	}),
})

const InternalLog = Schema.define({
	className: 'InternalLog',
	rest: false,
	fields: (field) => ({
		message: field.string(),
	}),
})
```

The option accepts one boolean or a sparse immutable operation map:

```ts
interface RestSchemaRoutes {
	readonly find?: boolean
	readonly get?: boolean
	readonly first?: boolean
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

`restPlugin({ default })` accepts the same boolean or sparse map. Resolution is
an exact schema operation, then the plugin default, then the built-in default.
Omitted properties inherit rather than deny.

The built-in default for application-owned schemas enables `find`, `get`,
`first`, `exists`, `create`, `update`, and `delete`. It disables `count`,
`upsert`, and every bulk route. `default: true` deliberately enables every
schema operation, while `default: false` disables them all.

The final schema's root provenance controls eligibility. Plugin-owned schemas
are always private from generated CRUD routes in REST v1, regardless of the
global default. A plugin-owned `rest` occurrence is rejected as misleading
rather than authorizing its own storage. Credential, session, maintenance,
audit, and other plugin storage therefore cannot become public accidentally.
Plugins expose intended public behavior through explicit operations instead.

Route exposure is not authorization. A disabled route does not exist and
cannot be reached with Master. An enabled route still passes through installed
Access, ACL, validation, hooks, protected constraints, transactions, and the
ordinary Runtime pipeline. Core's shared
`UNVERIFIED_PUBLIC_TRANSPORT_PROTECTION` diagnostic remains active until the
application uses `acknowledgeUnverifiedProtection: true` for REST.

### Class routes stay short without ambiguous object identifiers

Every Core object identifier is a UUID v7. Static operation segments can
therefore be distinguished from the strictly validated object-ID segment
without adding `objects`, `queries`, or `mutations` path groups.

| Operation    | Method and path                                    |
| ------------ | -------------------------------------------------- |
| find         | `GET /api/v1/classes/{className}`                  |
| create       | `POST /api/v1/classes/{className}`                 |
| get          | `GET /api/v1/classes/{className}/{id}`             |
| update       | `PATCH /api/v1/classes/{className}/{id}`           |
| delete       | `DELETE /api/v1/classes/{className}/{id}`          |
| complex find | `POST /api/v1/classes/{className}/query`           |
| first        | `GET` or `POST /api/v1/classes/{className}/first`  |
| count        | `GET` or `POST /api/v1/classes/{className}/count`  |
| exists       | `GET` or `POST /api/v1/classes/{className}/exists` |
| upsert       | `POST /api/v1/classes/{className}/upsert`          |
| bulk create  | `POST /api/v1/classes/{className}/bulk/create`     |
| bulk update  | `POST /api/v1/classes/{className}/bulk/update`     |
| bulk delete  | `POST /api/v1/classes/{className}/bulk/delete`     |
| bulk upsert  | `POST /api/v1/classes/{className}/bulk/upsert`     |

Static segments are matched before the UUID v7 object route, and the object
route rejects every non-UUID-v7 segment. There are no method overrides,
trailing-slash aliases, or alternate pluralized names.

The item routes target by `id`. REST v1 does not add singular update or delete
routes for arbitrary unique predicates. The schema API retains those
capabilities for trusted TypeScript callers, while upsert keeps its explicit
unique `where` input.

### GET parameters and complex JSON map to existing inputs

A simple collection read accepts these case-sensitive query parameters:

- `where`: one URL-encoded JSON object using the generated Core `Where` input;
- `orderBy`: a comma-separated priority list where `-field` is descending and
  `field` is ascending;
- `select`: a comma-separated inclusive field list;
- `include`: comma-separated relationship paths such as `author,comments.author`;
- `limit`: a non-negative base-10 safe integer;
- `offset`: a non-negative base-10 safe integer.

The item `get`, create, update, and delete routes accept only their relevant
`select` and `include` result parameters. An `include` parameter may instead be
a URL-encoded JSON object matching the exact generated Core inclusion input
when nested target filters, projections, ordering, limits, or offsets are
needed. Delete accepts no inclusion.

Duplicate or unknown query parameters fail instead of using first- or
last-value wins. Empty names, duplicate fields, contradictory selections,
unknown fields, unsupported operators, and malformed JSON fail during REST
normalization before Runtime.

`POST /query` accepts the generated `findMany` input directly:

```json
{
	"where": {
		"published": { "eq": true },
		"views": { "gte": 100 }
	},
	"orderBy": {
		"createdAt": "desc",
		"id": "asc"
	},
	"select": {
		"title": true,
		"createdAt": true
	},
	"include": {
		"author": {
			"select": { "name": true }
		}
	},
	"limit": 20,
	"offset": 40
}
```

The POST `first` form accepts the generated `findOne` input. POST `count` and
`exists` accept only `{ "where": ... }`. Their GET forms use the corresponding
subset of the simple parameters. Irrelevant pagination, projection, inclusion,
or ordering parameters fail rather than being ignored.

REST injects a default collection limit of 100. The default maximum is 1,000
and may be lowered or raised explicitly through `restPlugin()`. `limit: 0` is
valid. Offset has no implicit ordering and no maximum beyond being a safe
integer. REST v1 has no cursor, `pageInfo`, `nextCursor`, or response metadata.

Every accepted value normalizes through the existing schema-aware Core input
normalizers. The resulting AST contains no URL, method, header, credential,
request object, response envelope, or REST-only node.

### Ordinary create and update bodies remain concise

The collection POST body is the create data object itself. REST wraps it as the
existing `{ data }` schema-command input after decoding schema-aware wire
values. Result selection and inclusion use query parameters.

```http
POST /api/v1/classes/Post?select=title,published
Content-Type: application/json

{
	"title": "Hello",
	"published": false
}
```

The item PATCH body is the update data map itself. Direct values replace fields,
`null` clears optional fields, and numeric operations use the tagged wire form:

```json
{
	"views": {
		"type": "increment",
		"value": 1
	}
}
```

The item DELETE request has no body. A missing or policy-hidden get, update, or
delete item produces the same protected not-found response.

Upsert keeps its exact logical branches:

```json
{
	"where": {
		"slug": { "eq": "hello" }
	},
	"create": {
		"slug": "hello",
		"title": "Hello"
	},
	"update": {
		"title": "Hello again"
	},
	"select": {
		"slug": true,
		"title": true
	}
}
```

Bulk bodies match their existing schema command inputs: create uses
`{ data: [...] }`, update uses ordered `{ where, data }` entries, delete uses
`{ where: [...] }`, and upsert uses ordered `{ where, create, update }` entries.
Their optional projection remains shared by every result.

Bulk execution is homogeneous, ordered, itemized, and always atomic. It runs
one singular Runtime lifecycle per item in one transaction and never exposes a
partial-success mode or a generic batch of arbitrary HTTP subrequests.

### Plugin operations use one explicit route family

Plugin operations are private unless all of these conditions hold:

1. the operation owner requests and receives `transport:expose`;
2. the owner contributes a compatible REST v1 wire binding and codecs;
3. `restPlugin({ operations })` enables the exact namespaced operation;
4. the operation has no route collision.

An enabled operation is invoked through
`POST /api/v1/operations/{namespacedOperation}`. Its body is
`{ "input": value }`, including `null` for an inputless operation, and its
response is `{ "result": value }`. The owner binding maps every declared public
plugin error code to one fixed HTTP status during static compilation. Missing
or incomplete mappings reject the route before startup.

Password Auth may later bind `password-auth.login` through this route family,
but REST does not import or identify that plugin.

### Headers and request correlation are canonical

The public request headers are:

- `X-UltimaBase-Application-Id`: required public application selection;
- `X-UltimaBase-Master-Key`: optional only when HTTP Master transport is
  explicitly enabled for the selected application;
- `Authorization: Bearer ...`: the default future session transport;
- `Cookie`: used only by an explicitly configured future cookie resolver;
- `X-UltimaBase-Request-Id`: optional accepted correlation input;
- `Content-Type: application/json`: required on every non-empty REST JSON body;
- `Accept`: absent, `*/*`, or compatible with `application/json`.

Responses use `Content-Type: application/json; charset=utf-8`, echo the final
`X-UltimaBase-Request-Id`, and set `Cache-Control: private, no-store`. Browser
policy may additionally add its accepted cache-safe CORS and `Vary` headers.

One accepted request ID must match `[A-Za-z0-9._:-]{1,128}`. If it is absent,
HTTP creates a new `crypto.randomUUID()` value. A malformed or duplicate value
fails closed before application work. The final ID appears in every response
header and every error body, but successful JSON bodies contain no metadata
object.

Header names are compared case-insensitively. More than one raw occurrence of
application ID, Master key, Authorization, Cookie, Content-Length, or request
ID fails before application selection, credential resolution, or route
dispatch. A single raw line is never split on commas to guess cardinality.

The server-provider request contract supplies the ordered original header
name/value pairs before Fetch normalization. The Hono Node provider derives
this evidence from the underlying Node request rather than `Headers`. A
provider that cannot prove original cardinality is incompatible and rejects
registration, or rejects the unsupported request before application work when
the limitation is request-specific.

Missing, unknown, duplicate, or ambiguous application identity and invalid,
disabled, or foreign credentials use indistinguishable public rejection text.
The response never identifies a registered application or confirms which part
of a credential pair was valid.

### JSON bodies are bounded while streaming

The REST body limit defaults to 1 MiB and is configurable per REST plugin
instance. `Content-Length` is an early rejection hint, never the authority for
body size. The provider and route count bytes while consuming the stream and
abort immediately after the limit is exceeded.

Absent `Content-Length` and chunked requests remain supported. Duplicate or
invalid lengths, a declared length that does not match the consumed body, and
the simultaneous presence of `Content-Length` and `Transfer-Encoding` fail
closed. Provider parsing that cannot expose a mismatch must reject the request
at its earlier safe boundary.

`POST` and `PATCH` JSON endpoints require `application/json`, optionally with a
UTF-8 charset. Empty required bodies, unsupported charsets, malformed JSON, and
unknown body properties fail before Runtime. GET and item DELETE requests do
not accept bodies.

### Success and error envelopes are stable

Successful singular schema and plugin-operation results use:

```json
{ "result": {} }
```

Collection and bulk results use:

```json
{ "results": [] }
```

Count and exists use `{ "count": 42 }` and `{ "exists": true }`. A first
request with no visible match returns `{ "result": null }`. Create and bulk
create return `201`; every other successful operation returns `200`. Delete
returns the selected pre-delete model rather than discarding the Runtime result.

HTTP owns errors before a selected route begins and REST owns errors after
dispatch, but both use one compatible envelope:

```json
{
	"error": {
		"code": "VALIDATION_ERROR",
		"message": "The request contains invalid values.",
		"retryable": false,
		"requestId": "33bc1e1d-0d84-43eb-8bb9-0ca5cd889cf8"
	}
}
```

Only explicitly public details may add `error.details`. Framework messages,
stacks, SQL, configuration, route inventory, policy state, registered app IDs,
and credentials never cross the boundary.

The stable initial mapping is:

| Status | Public failure                                                                |
| ------ | ----------------------------------------------------------------------------- |
| `400`  | malformed headers, path, query, JSON, wire codec, or unsupported REST version |
| `401`  | application or credential pair rejected before dispatch                       |
| `403`  | Runtime `PERMISSION_DENIED` or `MASTER_ACCESS_DENIED`                         |
| `404`  | disabled or unknown route, or protected `NOT_FOUND` target                    |
| `406`  | response media type not acceptable                                            |
| `408`  | request deadline reached before a response can be written                     |
| `413`  | streamed request body exceeds the configured limit                            |
| `415`  | request media type or charset unsupported                                     |
| `422`  | Runtime `VALIDATION_ERROR` for a structurally valid REST operation            |
| `500`  | unknown exception or non-public internal framework failure                    |

Client disconnection may prevent any response from being written but still
cancels the same Runtime work. Public plugin errors use their statically
declared REST binding. Every unmapped Core, plugin, or unknown failure becomes
the safe non-retryable internal error unless its trusted public contract says
otherwise.

### Built-in values have one schema-aware JSON representation

REST decodes values using the declared field kind, so marker-shaped objects in
a normal JSON field remain ordinary JSON.

- string, boolean, float, and safe integer use their JSON primitives;
- date, date-time, time, UUID, and decimal use their canonical strings;
- bigint uses a canonical base-10 integer string;
- binary uses `{ "type": "binary", "encoding": "base64", "data": "..." }`;
- an unloaded pointer uses
  `{ "type": "pointer", "className": "User", "id": "..." }`;
- an included pointer becomes its selected object or `null`;
- an included relation becomes an ordered JSON array of selected objects;
- embedded objects and lists recursively apply their declared field codecs;
- `null` remains explicit JSON null, while an absent property remains absent;
- JavaScript `undefined`, non-finite numbers, and unrecognized tagged values
  are not representable.

Pointer input must name the field's exact target schema. Relation fields are
handles and cannot be supplied as create or ordinary update values. Numeric
`increment` and `decrement` use `{ "type", "value" }` with a field-compatible
operand. Plugin-defined scalar fields require an exact portable REST v1 codec
from their owner before a schema containing them can expose a route.

### Server sharing is explicit and atomic per application

One value returned by `honoServerPlugin()` identifies one server provider and
may be installed deliberately in several `UltimaBase` applications. Reusing
that exact value shares its provider; separate factory calls create separate
providers.

```ts
const server = honoServerPlugin({ port: 1337 })

const publicApi = new UltimaBase({
	plugins: [server, httpPlugin({ appId: 'public-api' }), restPlugin()],
	schemas: [Post],
})

const adminApi = new UltimaBase({
	plugins: [server, httpPlugin({ appId: 'admin-api' }), restPlugin()],
	schemas: [AuditLog],
})
```

The provider validates a candidate application's complete app ID, browser
policy, protocol versions, route graph, and collisions before committing one
immutable mount-table replacement. A failed later mount registers no route or
application ID and leaves the running server unchanged. Startup rollback
removes only the failing candidate.

The framework-owned provider opens its listener after its first valid mount and
closes it only after the last attached application stops or disposal completes.
Stopping one application atomically removes only its dispatch entry. Repeated
start, stop, failure, and disposal remain idempotent for the exact application.

When the developer supplies an existing Hono application, the provider mounts
one dispatcher but never starts, stops, or disposes the external listener or
application. The developer starts it only after UltimaBase mount validation
succeeds. Browser policy is either wholly external or wholly UltimaBase-owned
as required by ADR-0226.

The app ID is unique per server provider. Applications with different app IDs
may expose identical methods and paths because application selection precedes
route dispatch. The shared provider owns no global mutable registry outside its
explicit instance.

## Parse Server differences

REST v1 deliberately keeps Parse's approachable class routes, application-ID
header, JSON query parameter, `results` collection envelope, limit-and-offset
pagination, and direct create/update data bodies. It does not promise Parse
compatibility.

In particular, UltimaBase:

- uses `/api/v1`, UUID v7 `id`, `PATCH`, `offset`, `select`, and Core operators;
- returns stable `result`, `results`, `count`, `exists`, and nested error
  envelopes rather than Parse's operation-specific success shapes;
- exposes complex queries through explicit POST routes;
- exposes no cursor, response metadata, client key, REST API key, read-only
  Master key, Parse session header, method override, or schemaless class write;
- keeps REST route exposure separate from Access and never lets Master revive a
  disabled route;
- uses homogeneous always-atomic bulk operations instead of a generic batch of
  HTTP subrequests;
- exposes plugin behavior only through owned operations and keeps plugin
  storage schemas private;
- supports explicitly shared, application-isolated server providers while
  retaining one Runtime pipeline per application.

Files, aggregates, schema administration, realtime, OpenAPI, SDK behavior,
health endpoints, and authentication-specific routes remain outside this
contract.

## Complete developer example

```ts
const Post = Schema.define({
	className: 'Post',
	rest: {
		count: true,
		upsert: true,
	},
	fields: (field) => ({
		published: field.boolean({ default: false }),
		title: field.string({ required: true }),
	}),
})

const server = honoServerPlugin({ port: 1337 })

const ultimabase = new UltimaBase({
	masterAuthority: new MasterAuthority({
		keys: [env.MASTER_KEY],
		onUse: auditMasterUse,
	}),
	plugins: [
		httpPlugin({
			appId: 'blog',
			master: { enabled: true },
		}),
		restPlugin({
			basePath: '/api',
			acknowledgeUnverifiedProtection: true,
		}),
		server,
	],
	schemas: [Post],
})

await ultimabase.start()
```

```sh
curl --get 'http://localhost:1337/api/v1/classes/Post' \
  --header 'X-UltimaBase-Application-Id: blog' \
  --data-urlencode 'where={"published":{"eq":true}}' \
  --data-urlencode 'orderBy=-createdAt,id' \
  --data-urlencode 'select=title,createdAt' \
  --data-urlencode 'limit=20' \
  --data-urlencode 'offset=0'
```

```ts
const response = await fetch(
	'http://localhost:1337/api/v1/classes/Post/query',
	{
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'X-UltimaBase-Application-Id': 'blog',
		},
		body: JSON.stringify({
			where: { published: { eq: true } },
			orderBy: { createdAt: 'desc', id: 'asc' },
			select: { title: true, createdAt: true },
			limit: 20,
			offset: 0,
		}),
	},
)

const body = await response.json()
// { results: [{ id, title, createdAt }, ...] }
```

```sh
curl 'http://localhost:1337/api/v1/classes/Post?select=title,published' \
  --request POST \
  --header 'Content-Type: application/json' \
  --header 'X-UltimaBase-Application-Id: blog' \
  --header "X-UltimaBase-Master-Key: $MASTER_KEY" \
  --data '{"title":"Hello","published":false}'
```

## Consequences

- Basic CRUD stays as concise as Parse while complex operations retain exact
  Core inputs and independent Access semantics.
- Direct schema options make route intent visible and type-generatable, while
  global defaults remain application-local deployment policy.
- UUID v7 identifiers let static operations and item routes coexist without a
  reserved arbitrary-ID namespace.
- Consistent envelopes cost one `result` property for singular results but
  simplify codecs, errors, plugin operations, and future SDK generation.
- REST normalization remains a transport adapter over existing logical
  operations rather than a second query or mutation engine.
- Public schema storage contributed by plugins is intentionally impossible in
  v1; a future need requires a new explicit application-consent contract.

## Non-goals

- Parse wire compatibility or support for existing Parse SDKs.
- Cursor pagination, response metadata, mixed HTTP batches, or partial success.
- OpenAPI, a client SDK, files, aggregates, realtime, administration, or
  transport-specific authorization rules.
- Authentication identity, session, cookie, or CSRF semantics, which issue
  2318 decides separately.
