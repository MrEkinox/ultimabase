# Open plugin authoring target

This document records the accepted milestone 14 developer experience. It is a
target contract, not a claim that the APIs below are implemented before the
corresponding issues complete.

## Author one plugin

A plugin separates static application declarations from resource-backed setup:

```ts
import { defineOperation } from '@ultimabase/core'
import {
	definePluginModule,
	patchSchemas,
	providePluginOperation,
	schemaPatch,
} from '@ultimabase/plugin-kit'

const workflow = definePluginModule({
	pluginId: 'community.workflow',
	version: '1.0.0',
	core: '^1.0.0',
})

export const publishPost = defineOperation({
	name: 'community.workflow.publish-post',
	version: '1.0.0',
	target: 'schema',
	transaction: 'required',
	input: publishPostInput,
	result: publishPostResult,
})

const publishProvider = providePluginOperation({
	contributionId: 'publish-post',
	operation: publishPost,
	execute: async ({ input, request }) => executePublish(input, request),
})

export const workflowPlugin = (options: WorkflowPluginOptions) =>
	workflow.plugin({
		instanceId: options.instanceId,
		privileges: [
			{
				name: 'schema:declare',
				reason: 'Declares the workflow option namespace.',
			},
			{
				name: 'schema:transform',
				reason: 'Adds workflow fields to selected content schemas.',
			},
			{
				name: 'model:extend',
				reason: 'Adds publish commands to application schema handles.',
			},
			{
				name: 'operation:declare',
				reason: 'Declares the publish-post operation.',
			},
			{
				name: 'typegen:contribute',
				reason: 'Describes the correlated publish operation types.',
			},
		],
		capabilities: { provides: [publishProvider] },
		declare({ schemas, models, operations }) {
			schemas.defineOption(workflowOptionNamespace)
			const contentSchemas = schemas.select({ option: 'workflow.enabled' })

			schemas.patch(
				patchSchemas({
					targets: contentSchemas,
					patch: schemaPatch()
						.addField({
							contributionId: 'workflow-state',
							name: 'workflowState',
							field: workflowStateField,
						})
						.addIndex({
							contributionId: 'workflow-state-index',
							fields: ['workflowState', 'createdAt'],
						}),
				}),
			)

			operations.declare(publishPost)
			models.extend(contentSchemas, {
				commands: { publish: publishPost },
			})
		},
	})
```

The exact registrars are privilege-scoped. The static callback cannot read
secrets, services, adapters, clocks, or network state. Setup may materialize
application capabilities but cannot register an undeclared or denied power.

Issues 1405 through 1417 deliver the owner-bound registrars, immutable operation
contracts, Runtime execution, and adapter bridges used above. Issue 1411 adds
the focused authoring helpers while keeping every privilege and contribution
visible to Core.
The capability kernel available after issue 1404 declares resource factories
statically and exposes only exact requirement reads during setup:

```ts
const auditRequirement = requireCapability(auditCapability, '^1.0.0')

definePlugin({
	pluginId: 'community.audit-provider',
	version: '1.0.0',
	core: '^0.0.0',
	capabilities: {
		provides: [
			provideCapability(auditCapability, {
				contributionId: 'primary',
				create: () => ({
					value: createAuditProvider(),
					dispose: () => closeAuditProvider(),
				}),
			}),
		],
	},
})

definePlugin({
	pluginId: 'community.audit-consumer',
	version: '1.0.0',
	core: '^0.0.0',
	capabilities: { requires: [auditRequirement] },
	setup: ({ capabilities }) => {
		const audit = capabilities.get(auditRequirement)
		return { audit }
	},
})
```

The token's required `compose` function converts final ordered providers into
the consumer view. Replacements target one structured owner and contribution
ID; decorators wrap only complete `single` or `pipeline` consumer views.

Complex TypeScript contracts use a structured Typegen contribution. They never
inject an executable callback into generated output:

```ts
declare({ typegen }) {
	typegen.contribute({
		imports: [workflowPublicTypes],
		operations: [publishPostTypegenDescriptor],
	})
}
```

## Configure privileges

Requested privileges are allowed by default but visible and cumulatively
denyable:

```ts
const ultimabase = new UltimaBase({
	schemas: [PostSchema],
	plugins: [workflowPlugin({ instanceId: 'editorial' })],
	pluginPrivileges: {
		deny: ['adapter:raw', 'runtime:replace'],
		denyClaims: ['environment:native-code'],
		plugins: {
			'community.workflow': {
				deny: ['transport:expose'],
				instances: {
					editorial: {
						deny: ['authority:elevate'],
					},
				},
			},
		},
	},
})
```

Startup reports the plugin instance, version, requested powers, reasons,
severity, environmental claims, and policy result. A denied active privilege
prevents declarations and infrastructure work. `denyClaims` rejects announced
direct Node.js behavior without pretending to sandbox in-process JavaScript.
Use `pluginPrivileges.logger: false` for explicit silence or supply an
`{ info, error }` logger; the same detached result remains available through
`ultimabase.application.pluginPrivilegeReport`.

## Use the plugin with TypeScript

Stable operations can use their exported token. Application-specific model
surfaces use the application schema handle rather than mutating the exported
schema class:

```ts
await ultimabase.operation(publishPost).execute({
	schema: 'Post',
	id: postId,
})

const Post = ultimabase.schema('Post')
await Post.publish({ id: postId })

const post = await Post.findOne({ where: { id: postId } })
await post.publish()
```

Typegen augments application handles and returned models with the exact
installed plugin surface. It emits declarations and inert metadata only, never
a Runtime client. Dynamic code can still call
`Post.for(post).command(name).execute(input)`.

## Use the same plugin from JavaScript

JavaScript uses the same application and Runtime without Typegen:

```js
const Post = ultimabase.schema('Post')
const post = await Post.findOne({ where: { id: postId } })

await post.publish()
await ultimabase.operation('community.workflow.publish-post').execute({
	schema: 'Post',
	id: postId,
})
```

Names, payloads, results, ownership, capability versions, and application
lifetime are validated at runtime.

## Adapter and transport bridges

A portable plugin declares logical values and operations independently. A
database-specific bridge contributes storage codecs, constraints, persistence
plans, physical schema metadata, or migrations through that adapter's versioned
capabilities. A transport-specific bridge contributes an explicit wire codec
and exposure binding. Installing the logical plugin alone exposes neither raw
adapter access nor a public endpoint.

## Community toolbox boundary

`@ultimabase/plugin-kit` removes repeated immutable declaration and composition
code. `@ultimabase/testing` supplies a runner-agnostic public conformance suite
for manifests, structured instances, denials, capabilities, deterministic
declarations, provenance, lifecycle cleanup, and application isolation. Optional
named checks cover Typegen, JavaScript and typed operations, schema/model
surfaces, transports, middleware, persistence, codecs, migrations, and adapter
failures. Fresh application factories preserve exact fixture inference and are
disposed automatically.

The harness reports the exact failed contract and uses only public package
exports. It does not read Core registries, grant undeclared privileges, or
impose PostgreSQL on a logical plugin. Neither authoring package owns
privileges, owner binding, registries, Master, or capability storage; those
checks remain in Core.
