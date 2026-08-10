# Typed extensions

Schema and field extensions carry plugin configuration without teaching
`@ultimabase/core` how to interpret it. The extension name is also the expected
plugin name by default. Pass a third argument when one plugin handles several
extension identities.

```ts
import {
	defineContextualSchemaExtensionFactory,
	defineFieldExtension,
	Schema,
	defineSchemaExtension,
	stringField,
	type SchemaExtension,
	type SchemaExtensionContextKind,
} from '@ultimabase/core'

const contentMetadataPluginName = '@example/content-metadata'

const contentCategory = defineSchemaExtension(
	'content-category',
	{ category: 'article' as const },
	contentMetadataPluginName,
)

const searchMetadata = defineFieldExtension(
	'search-metadata',
	{ weight: 2 as const },
	contentMetadataPluginName,
)

export const PostSchema = Schema.define({
	className: 'Post',
	fields: (field) => ({
		title: field.string(),
		draftNotes: field.string({ extensions: [searchMetadata] }),
	}),
	extensions: [contentCategory],
})
```

When extension options contain callbacks that should understand sibling
fields, the extension package can expose a contextual factory. `bind` derives
the data contract from `fields`; the application does not repeat an interface:

```ts
interface ContentPolicyOptions<
	TData extends Readonly<Record<string, unknown>>,
> {
	readonly resolve: (input: Readonly<{ data: TData }>) => string
}

type ContentPolicyData<TData> =
	TData extends Readonly<Record<string, unknown>> ? TData : never

type ContentPolicyExtension<TData extends Readonly<Record<string, unknown>>> =
	SchemaExtension<
		'content-policy',
		ContentPolicyOptions<TData>,
		typeof contentMetadataPluginName
	>

interface ContentPolicyKind extends SchemaExtensionContextKind {
	readonly options: ContentPolicyOptions<ContentPolicyData<this['data']>>
	readonly extension: ContentPolicyExtension<ContentPolicyData<this['data']>>
}

const createContentPolicy = <TData extends Readonly<Record<string, unknown>>>(
	options: ContentPolicyOptions<TData>,
): ContentPolicyExtension<TData> =>
	defineSchemaExtension('content-policy', options, contentMetadataPluginName)

const contentPolicy =
	defineContextualSchemaExtensionFactory<ContentPolicyKind>()(
		createContentPolicy,
	)

const ProtectedPost = Schema.define({
	className: 'ProtectedPost',
	fields: (field) => ({
		title: field.string({ validation: { required: true } }),
		visibility: field.string(),
	}),
	extensions: ({ bind }) => [
		bind(contentPolicy, {
			resolve: ({ data }) => data.visibility ?? data.title,
		}),
	],
})
```

`data.title` is `string`, `data.visibility` is `string | undefined`, and unknown,
system, or extension-reserved fields are rejected by TypeScript. Static metadata
continues to use the direct `extensions: [contentCategory]` tuple.

Each value is immutable and retains its literal scope, name, expected plugin,
and configuration type. Core requires the expected plugin to register handlers
for both extension identities during application setup.

Schema extensions may also contribute reserved fields through the same neutral
contract. Core merges these fields into validation and TypeScript inference but
does not interpret their kind or configuration:

```ts
const ownership = defineSchemaExtension(
	'ownership',
	{ version: 1 as const },
	contentMetadataPluginName,
	{
		fields: {
			ownerKey: stringField({ validation: { required: true } }),
		},
	},
)

const OwnedPost = Schema.define({
	className: 'OwnedPost',
	fields: (field) => ({
		title: field.string(),
	}),
	extensions: [ownership],
})

OwnedPost.fields.ownerKey // StringField
```

Here, “reserved” means owned by the extension rather than by application code.
An exact extension map still cannot use framework-reserved system, Query
logical, or model-capability names. TypeScript rejects those literal collisions;
dynamic plugin maps retain the equivalent runtime check.

Developer fields, framework fields, and fields contributed by separate
extensions cannot share a name. A plugin may defer one required contributed
value until its `resolveInput` hook; structural revalidation then guarantees
that the field exists before Access and persistence.

Portable plugin scalar values may provide a private versioned JSON codec for
database adapters without adding callbacks to public field metadata:

```ts
import { definePluginField } from '@ultimabase/core'

const opaqueTokenField = definePluginField(
	'example.opaque-token',
	{ validation: { required: true } },
	{
		snapshotValue: (value, path): string => {
			if (typeof value !== 'string') throw new TypeError(`${path} must be text`)
			return value
		},
		storageCodec: {
			format: 'json',
			version: 1,
			encode: (value) => ({ value, version: 1 }),
			decode: (stored): string => {
				if (
					typeof stored !== 'object' ||
					stored === null ||
					!('value' in stored) ||
					typeof stored.value !== 'string'
				) {
					throw new TypeError('Stored token is invalid')
				}

				return stored.value
			},
		},
	},
)
```

Specialized physical types such as vectors may omit this capability and remain
owned by a dedicated adapter plugin.
