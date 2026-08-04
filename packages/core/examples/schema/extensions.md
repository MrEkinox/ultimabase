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
