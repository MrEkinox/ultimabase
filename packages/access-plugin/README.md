# `@ultimabase/access-plugin`

The optional official Access engine for UltimaBase. The package owns schema and
field `access` declarations, deterministic policy compilation, diagnostics, and
protected Runtime enforcement. Importing it has no effect; an application must
configure `accessPlugin()` explicitly.

```ts
import { accessPlugin } from '@ultimabase/access-plugin'
import { Schema, UltimaBase } from '@ultimabase/core'

const Post = Schema.define({
	className: 'Post',
	fields: (field) => ({
		secret: field.string({ access: { read: false } }),
		title: field.string(),
	}),
	access: {
		read: { where: ({ where }) => where.eq('published', true) },
	},
})

const ultimabase = new UltimaBase({
	plugins: [accessPlugin()],
	schemas: [Post],
})
```

Without `accessPlugin()`, the `access` option is not declared and application
compilation fails. Typegen emits the corresponding option augmentations only
for applications that install the plugin.

## Defaults

The default is permissive when no exact declaration exists. Applications may
choose one complete application-local fallback:

```ts
accessPlugin({ default: false })
accessPlugin({ default: { field: true, operation: false } })
```

Defaults belong to the configured plugin instance and never mutate a schema or
another application.

## Official-compatible providers

A plugin that intentionally contributes official Access declarations uses the
public contribution helpers and declares a non-ordering peer. The provider may
appear before or after the engine in plugin configuration.

```ts
import {
	provideAccessContributions,
	schemaAccess,
} from '@ultimabase/access-plugin'
import { definePlugin } from '@ultimabase/core'

export const editorialPolicyPlugin = definePlugin({
	version: '1.0.0',
	core: '^0.0.0',
	pluginId: 'community.editorial-policy',
	peers: [{ pluginId: '@ultimabase/access-plugin', version: '^0.0.0' }],
	privileges: [
		{
			name: 'runtime:constrain',
			reason: 'Contributes official Access policy.',
		},
	],
	capabilities: {
		provides: [
			provideAccessContributions('published-posts', () =>
				schemaAccess(Post, {
					read: {
						where: ({ where }) => where.eq('published', true),
					},
				}),
			),
		],
	},
})
```

`globalAccess`, `schemaAccess`, and `fieldAccess` cover direct targets.
`schemaExtensionAccess`, `fieldExtensionAccess`, and `fieldKindAccess` let a
provider protect artifacts it owns without enumerating application occurrences;
`defineFieldKindAccessTarget` creates the exact namespaced field-kind target.
All helpers normalize declarations before the official engine consumes them.
Every provider policy narrows the developer policy; no contribution can
override an earlier denial.

Independent policy engines should not depend on this package. They can define
their own authoring vocabulary and contribute Core `protectedPolicy()` values
directly.

ACL follows that independent path: `@ultimabase/acl-permissions-plugin` depends
only on Core's generic protected-policy and adapter-constraint contracts. It
protects ACL-enabled schemas with no official Access engine installed and
composes monotonically when Access or another policy engine is present.

## Diagnostics

Provide `accessDiagnosticsObserverCapability` from a plugin with
`runtime:observe` to receive immutable callback completion events. Observer
failures are isolated and cannot change a policy outcome.
