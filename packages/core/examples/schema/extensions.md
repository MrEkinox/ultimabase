# Typed extensions

Schema and field extensions carry plugin configuration without teaching
`@ultimabase/core` how to interpret it. The extension name is also the expected
plugin name by default. Pass a third argument when one plugin handles several
extension identities.

```ts
import {
	defineFieldExtension,
	Schema,
	defineSchemaExtension,
	stringField,
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
	fields: {
		title: stringField(),
		draftNotes: stringField({ extensions: [searchMetadata] }),
	},
	extensions: [contentCategory],
})
```

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
	fields: { title: stringField() },
	extensions: [ownership],
})

OwnedPost.fields.ownerKey // StringField
```

Developer fields, framework fields, and fields contributed by separate
extensions cannot share a name. A plugin may defer one required contributed
value until its `resolveInput` hook; structural revalidation then guarantees
that the field exists before Access and persistence.
