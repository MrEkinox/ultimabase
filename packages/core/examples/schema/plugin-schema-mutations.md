# Plugin schema mutations

A plugin can declare an item-oriented workflow mutation without adding its
product vocabulary to Core or mutating an exported schema class.

```ts
import {
	Schema,
	defineOperationValue,
	definePlugin,
	defineSchemaMutation,
} from '@ultimabase/core'

const Post = Schema.define({
	className: 'Post',
	fields: (field) => ({
		title: field.string({ required: true }),
		workflowState: field.string({ required: true }),
	}),
})

const archive = defineSchemaMutation({
	authority: 'request',
	effect: 'update',
	errors: ['community.workflow.archive-rejected'],
	input: defineOperationValue((value, path) => {
		if (
			typeof value !== 'object' ||
			value === null ||
			!('reason' in value) ||
			typeof value.reason !== 'string'
		) {
			throw new TypeError(`${path}.reason must be a string`)
		}
		return Object.freeze({ reason: value.reason })
	}),
	name: 'community.workflow.archive',
	returning: 'after',
	select: { workflowState: true },
	version: '1.0.0',
})

export const workflowPlugin = definePlugin({
	core: '^0.0.0',
	pluginId: 'community.workflow',
	privileges: [
		{ name: 'operation:declare', reason: 'Declares archive.' },
		{ name: 'model:extend', reason: 'Adds direct archive methods.' },
	],
	version: '1.0.0',
	declare: ({ models, operations }) => {
		operations.declare(archive)
		models.extend(Post, {
			contributionId: 'workflow-mutations',
			schemaMutations: {
				archive: { mutation: archive, surfaces: ['schema', 'model'] },
			},
		})
	},
})
```

The source token retains its input snapshot privately. Application compilation
publishes only inert identity, authority, effect, error, dependency, returning,
owner, and provenance facts. A flat dependency `select` may name stored scalar,
object, or pointer values; Core retains `id` automatically and rejects virtual,
relation, or missing fields before setup.

With the generated application declaration, the two direct surfaces are shaped
like this:

```ts
await ultimabase.schema(Post).archive({
	id: postId,
	input: { reason: 'superseded' },
	select: { title: true, workflowState: true },
})

const post = await ultimabase.schema(Post).get({ id: postId })
await post.archive({ input: { reason: 'superseded' } })
```

The model form exists only on persisted application-owned models and omits the
target `id`. A payload whose generated type is `undefined` also omits `input`.
Both forms use the ordinary `OperationOptions` as their second argument. The
declaration milestone exposes and types these methods but intentionally rejects
execution until the separate schema-mutation Runtime provider is installed.
