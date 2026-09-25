# Plugin schema mutations

A plugin can declare an item-oriented workflow mutation without adding its
product vocabulary to Core or mutating an exported schema class.

```ts
import {
	Schema,
	addSchemaField,
	contributeSchemaMutation,
	defineOperationValue,
	defineOperationTransport,
	definePlugin,
	defineSchemaMutation,
	schemaMutationTransportBinding,
	schemaMutationWireCodec,
	stringField,
} from '@ultimabase/core'

const Post = Schema.define({
	className: 'Post',
	fields: (field) => ({
		title: field.string({ required: true }),
	}),
})

const archiveInput = defineOperationValue((value, path) => {
	if (
		typeof value !== 'object' ||
		value === null ||
		!('reason' in value) ||
		typeof value.reason !== 'string'
	) {
		throw new TypeError(`${path}.reason must be a string`)
	}
	return Object.freeze({ reason: value.reason })
})

const archive = defineSchemaMutation({
	authority: 'request',
	effect: 'update',
	errors: ['community.workflow.archive-rejected'],
	input: archiveInput,
	name: 'community.workflow.archive',
	returning: 'after',
	select: { workflowState: true },
	version: '1.0.0',
})

// The owner names REST v1 without importing the optional REST package.
const restV1 = defineOperationTransport({
	name: 'ultimabase.rest',
	version: '1.0.0',
})

export const workflowPlugin = definePlugin({
	operations: [
		contributeSchemaMutation({
			bindings: [
				schemaMutationTransportBinding({
					codec: schemaMutationWireCodec({
						decode: (value) =>
							archiveInput.snapshot(value, 'REST archive input'),
						mutation: archive,
						transport: restV1,
					}),
					metadata: {
						errors: { 'community.workflow.archive-rejected': 409 },
					},
					mutation: archive,
				}),
			],
			mutation: archive,
			resolve: async ({ context, input, originalItem, target }) => {
				await auditArchiveRequest({ context, input, originalItem, target })
				return { data: { workflowState: 'archived' } }
			},
		}),
	],
	core: '^0.0.0',
	pluginId: 'community.workflow',
	privileges: [
		{ name: 'operation:declare', reason: 'Declares archive.' },
		{ name: 'model:extend', reason: 'Adds direct archive methods.' },
		{ name: 'persistence:rewrite', reason: 'Persists the archive state.' },
		{ name: 'schema:declare', reason: 'Adds the owned workflow field.' },
		{ name: 'transport:expose', reason: 'Binds archive to REST v1.' },
	],
	version: '1.0.0',
	declare: ({ models, schemas }) => {
		schemas.patch({
			operations: [
				addSchemaField({
					contributionId: 'workflow-state',
					field: stringField(),
					name: 'workflowState',
				}),
			],
			targets: schemas.select({ className: Post.className }),
		})
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

Static mutation names are visible only while their owning application is active.
After `dispose()`, those names disappear from the schema class view. A later
application may reuse the same schema with different mutations; captured
dispatchers still check its selected graph, and old application/model handles
remain invalid. No exported class or prototype is mutated.

The model form exists only on persisted application-owned models and omits the
target `id`. A payload whose generated type is `undefined` also omits `input`.
Both forms use the ordinary `OperationOptions` as their second argument. The
resolver cannot access the adapter, authority grants, constraints, transaction
control, or the application engine. Queries started through ordinary schema APIs
inherit the same root request transaction. Core locks the visible target,
snapshots the declared resolver selection, validates the owner-only effect, and
materializes the requested before/after projection without replaying native
update or delete behavior.

Optional policy engines inspect the final callback-free mutation catalog through
Core's versioned `applicationSchemaMutationSurfaceCapability`. For example, when
`@ultimabase/access-plugin` is installed, Typegen makes the exact request
mutation available as a schema option:

```ts
import { accessPlugin } from '@ultimabase/access-plugin'
import { Schema, UltimaBase } from '@ultimabase/core'

const SecuredPost = Schema.define({
	className: 'Post',
	access: {
		archive: {
			allow: ({ input }) => input.reason.length > 0,
			where: ({ where }) => where.eq('workflowState', 'published'),
			item: ({ item }) => item.workflowState === 'archived',
		},
		update: false,
		delete: false,
	},
	fields: (field) => ({ title: field.string({ required: true }) }),
})

const securedApplication = new UltimaBase({
	plugins: [accessPlugin()],
	schemas: [SecuredPost],
})
```

The `archive` branch remains independent from native update and delete policy.
The same identity is available to the optional official Hooks engine:

```ts
import { hooksPlugin } from '@ultimabase/hooks-plugin'

const ObservedPost = Schema.define({
	className: 'Post',
	fields: (field) => ({ title: field.string({ required: true }) }),
	hooks: {
		beforeOperation: {
			archive: ({ input, originalItem, item }) => {
				console.log(input.reason, originalItem, item)
			},
		},
		afterOperation: {
			archive: ({ context, item }) => {
				context.emit('post.archived', { id: item.id })
			},
		},
	},
})

const observedApplication = new UltimaBase({
	plugins: [hooksPlugin()],
	schemas: [ObservedPost],
})
```

Custom before and after callbacks retain the root transaction and run for
Master-only mutations too. A physical update or delete never manufactures the
corresponding native Hook branch. Core owns only the generic immutable catalog
and never imports or installs either official engine.
