# Open plugin authoring target

This document records the accepted milestone 14 developer experience. It is a
target contract, not a claim that the APIs below are implemented before the
corresponding issues complete.

## Author one plugin

A plugin separates static application declarations from resource-backed setup:

```ts
import { defineOperation, definePlugin } from '@ultimabase/core'
import { defineOperationHandler, patchSchemas } from '@ultimabase/plugin-kit'

export const publishPost = defineOperation({
	name: 'community.workflow.publish-post',
	version: '1.0.0',
	target: 'schema',
	transaction: 'required',
	input: publishPostInput,
	result: publishPostResult,
})

export const workflowPlugin = (options: WorkflowPluginOptions) =>
	definePlugin({
		pluginId: 'community.workflow',
		instanceId: options.instanceId,
		version: '1.0.0',
		core: '^1.0.0',
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
		declare({ schemas, models, operations }) {
			schemas.defineOption(workflowOptionNamespace)
			const contentSchemas = schemas.select({ option: 'workflow.enabled' })

			patchSchemas(contentSchemas, (schema) =>
				schema
					.addField('workflowState', workflowStateField)
					.addIndex('workflow-state', ['workflowState']),
			)

			operations.declare(publishPost)
			models.extend(contentSchemas, {
				commands: { publish: publishPost },
			})
		},
		setup({ capabilities }) {
			capabilities.provide(
				defineOperationHandler(publishPost),
				async ({ input, request }) => {
					return executePublish(input, request)
				},
			)
		},
	})
```

The exact registrars are privilege-scoped. The static callback cannot read
secrets, services, adapters, clocks, or network state. Setup may materialize
application capabilities but cannot register an undeclared or denied power.

The workflow `declare(...)` and operation-handler surface above is the accepted
milestone target; issues 1405 through 1417 deliver those domain-specific hosts.
Issue 1405 establishes this single callback with exact declaration-capability
reads and the `fields` registrar when `schema:declare` is active. Schema,
patch, model, operation, and Typegen registrars remain target APIs until their
own follow-up issues deliver their descriptor contracts.
Issue 1407 implements dynamic schema resolution, immutable operation
declarations and envelopes, direct or selector-bound model surfaces, and
ordinary QueryBuilder extensions. The `execute()` and handler calls shown in
this target document remain issue 1416 work; until then `prepare()` validates an
inert logical envelope without running Runtime or exposing a transport.
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
await Post.for(post).publish()
```

Typegen augments these handles with the exact installed plugin surface. It emits
declarations and inert metadata only, never a Runtime client.

## Use the same plugin from JavaScript

JavaScript uses the same application and Runtime without Typegen:

```js
const Post = ultimabase.schema('Post')
const post = await Post.findOne({ where: { id: postId } })

await Post.for(post).publish()
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
code. `@ultimabase/testing` supplies public conformance fixtures. Neither
package owns privileges, owner binding, registries, Master, or capability
storage; those checks remain in Core.
