# @ultimabase/hooks-plugin

Optional official lifecycle Hooks for UltimaBase.

The package contains both the public authoring contract and its Runtime engine.
Importing it does not install behavior; add `hooksPlugin()` to the application
plugin list. Applications that omit it expose no official `hooks` schema or
field option through generated types.

```ts
import { Schema, UltimaBase } from '@ultimabase/core'
import { hooksPlugin } from '@ultimabase/hooks-plugin'

const Post = Schema.define({
	className: 'Post',
	fields: (field) => ({ title: field.string() }),
	hooks: {
		beforeOperation: {
			create: ({ data }) => ({ data }),
		},
	},
})

const ultimabase = new UltimaBase({
	schemas: [Post],
	plugins: [hooksPlugin()],
})
```

Plugins intentionally extending the official lifecycle may import its callback
types, selectors, and capability contracts from this package. Independent
behavior engines should own their vocabulary and use Core's generic Runtime
behavior capability directly.

An extension declares Hooks as a peer rather than a lifecycle dependency,
because the Hooks engine consumes the extension's contribution capability:

```ts
definePlugin({
	pluginId: 'community.workflow-hooks',
	version: '1.0.0',
	core: '^0.0.0',
	peers: [{ pluginId: '@ultimabase/hooks-plugin', version: '^0.0.0' }],
	// privileges and hook contribution capabilities...
})
```
