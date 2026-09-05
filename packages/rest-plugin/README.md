# `@ultimabase/rest-plugin`

`@ultimabase/rest-plugin` owns the experimental REST v1 route graph and read
normalization boundary. It generates immutable application-local metadata under
`/api/v1` by default and decodes accepted GET or JSON read requests into Core's
existing Query and Operation AST. Normalization does not execute Runtime, import
Hono, start listeners, load targets, or retain request data in an AST.

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
