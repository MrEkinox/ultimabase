# Typed extensions

Schema and field extensions carry plugin configuration without teaching
`@ultimabase/schema` how to interpret it. The extension name is also the expected
plugin name by default. Pass a third argument when one plugin handles several
extension identities.

```ts
import {
	defineFieldExtension,
	Schema,
	defineSchemaExtension,
	stringField,
} from '@ultimabase/schema'

const permissionPluginName = '@example/permissions'

const classPermissions = defineSchemaExtension(
	'class-permissions',
	{ find: 'authenticated' as const },
	permissionPluginName,
)

const fieldPermissions = defineFieldExtension(
	'field-permissions',
	{ read: 'owner' as const },
	permissionPluginName,
)

export const PostSchema = new Schema({
	className: 'Post',
	fields: {
		title: stringField(),
		draftNotes: stringField({ extensions: [fieldPermissions] }),
	},
	extensions: [classPermissions],
})
```

Each value is immutable and retains its literal scope, name, expected plugin,
and configuration type. Core requires the expected plugin to register handlers
for both extension identities during application setup.
