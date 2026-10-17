# @ultimabase/plugin-kit

Optional authoring helpers for official and community plugins: the
`definePlugin` facade, events, option parsing, contextual fields, schema-patch
builders and the shared role protocol. It is not a plugin and installs no
behavior.

## Installation

```sh
npm install @ultimabase/plugin-kit @ultimabase/core
```

`@ultimabase/core` is a peer dependency.

## Example

A plugin that adds a feature and a command, from the tested
[`examples/plugin-authoring`](../../examples/plugin-authoring/README.md)
application:

<!-- region ../../examples/plugin-authoring/src/archive-plugin.ts#archive-plugin -->

```ts
import { dateTimeField } from '@ultimabase/core'
import { command, definePlugin, feature } from '@ultimabase/plugin-kit'

/** `archivable: true` adds a server-written `archivedAt` and two commands. */
export const archivePlugin = () =>
	definePlugin({
		name: '@example/archive-plugin',
		features: {
			archivable: feature({
				fields: { archivedAt: dateTimeField() },
				commands: {
					archiveOne: command({
						authority: 'request',
						effect: 'update',
						data: () => ({ archivedAt: new Date().toISOString() }),
					}),
					archiveMany: command({
						authority: 'request',
						effect: 'update',
						data: () => ({ archivedAt: new Date().toISOString() }),
						target: 'many',
					}),
				},
			}),
		},
	})
```

<!-- endregion -->

## Documentation

- [Build a Plugin](../../apps/website/content/docs/1.0.0/plugins/build-a-plugin/index.mdx)
- [Schema Contributions](../../apps/website/content/docs/1.0.0/plugins/build-a-plugin/schema-contributions.mdx)
- [Features and Rules](../../apps/website/content/docs/1.0.0/plugins/build-a-plugin/features-and-rules.mdx)
- [Operations and GraphQL](../../apps/website/content/docs/1.0.0/plugins/build-a-plugin/operations-and-graphql.mdx)
- [Runtime and Infrastructure](../../apps/website/content/docs/1.0.0/plugins/build-a-plugin/runtime-and-infrastructure.mdx)
