import {
	defineOperation,
	defineOperationValue,
	type FrameworkPlugin,
	type JsonObject,
	type PluginExports,
	type TypegenReference,
} from '@ultimabase/core'
import { expectTypeOf } from 'vitest'
import { z } from 'zod'

import {
	defineOutputDescriptor,
	definePluginModule,
	definePluginFieldOption,
	definePluginEvent,
	observePluginEvent,
	definePluginOptionsParser,
	defineTypegenModule,
	providePluginOperation,
	schemaPatch,
	type PluginModule,
	type PluginModuleInstance,
	type PluginOptionsParser,
	type SchemaPatchBuilder,
	type PluginEventObserver,
} from './index.js'

const ratingOutput = defineOutputDescriptor(
	'community.rating',
	{ list: false, nullable: false },
	(value): number => Number(value),
)
expectTypeOf(ratingOutput.kind).toEqualTypeOf<'community.rating'>()
// @ts-expect-error -- Plugin-owned output descriptor kinds must be namespaced.
defineOutputDescriptor('rating', { list: false, nullable: false }, Number)

const module = definePluginModule({
	core: '^2.0.0',
	pluginId: 'community.workflow',
	version: '1.4.0',
})

const contextualOption = definePluginFieldOption({
	contexts: ['stored', 'embedded'],
	normalize: (value: unknown) => String(value),
	protocolVersion: 1,
	typegen: false,
})
expectTypeOf(contextualOption.contexts).toEqualTypeOf<
	readonly ('stored' | 'embedded' | 'virtual' | 'output')[]
>()
expectTypeOf(module).toEqualTypeOf<
	PluginModule<'community.workflow', '1.4.0', '^2.0.0'>
>()

const plugin = module.plugin({
	instanceId: 'editorial',
	peers: [{ pluginId: 'community.protocol', version: '^1.0.0' }] as const,
	setup: () => ({ ready: true as const }),
})
expectTypeOf(plugin).toExtend<
	FrameworkPlugin<
		'community.workflow',
		Readonly<{ readonly ready: true }>,
		undefined,
		undefined,
		undefined,
		'editorial',
		'1.4.0',
		'^2.0.0',
		undefined,
		undefined,
		undefined,
		readonly [
			{
				readonly pluginId: 'community.protocol'
				readonly version: '^1.0.0'
			},
		]
	>
>()

type WorkflowPluginDefinition = Readonly<{
	readonly capabilities: Readonly<{
		readonly provides: readonly []
	}>
	readonly instanceId: 'editorial'
	readonly peers: readonly [
		Readonly<{
			readonly pluginId: 'community.protocol'
			readonly version: '^1.0.0'
		}>,
	]
	readonly privileges: readonly [
		Readonly<{
			readonly name: 'runtime:observe'
			readonly reason: 'Records workflow timing.'
		}>,
	]
	readonly setup: () => Readonly<{ readonly ready: true }>
}>
type DerivedWorkflowPlugin = PluginModuleInstance<
	typeof module,
	WorkflowPluginDefinition
>
const derivedWorkflowPlugin: DerivedWorkflowPlugin = module.plugin({
	capabilities: { provides: [] },
	instanceId: 'editorial',
	peers: [{ pluginId: 'community.protocol', version: '^1.0.0' }],
	privileges: [{ name: 'runtime:observe', reason: 'Records workflow timing.' }],
	setup: () => ({ ready: true as const }),
})
expectTypeOf(derivedWorkflowPlugin.manifest.identity.instanceId).toEqualTypeOf<
	'editorial' | undefined
>()
expectTypeOf(
	derivedWorkflowPlugin.manifest.capabilities.provides,
).toEqualTypeOf<readonly []>()
expectTypeOf(derivedWorkflowPlugin.peers?.[0]?.pluginId).toEqualTypeOf<
	'community.protocol' | undefined
>()
expectTypeOf<PluginExports<DerivedWorkflowPlugin>>().toEqualTypeOf<
	Readonly<{ readonly ready: true }>
>()

const parseOptions = definePluginOptionsParser({
	keys: ['enabled', 'mode'] as const,
	name: 'workflow options',
	normalize: ({ enabled, mode }) => ({
		enabled: enabled === true,
		mode: mode === 'publish' ? ('publish' as const) : ('review' as const),
	}),
})
expectTypeOf(parseOptions).toEqualTypeOf<
	PluginOptionsParser<{
		enabled: boolean
		mode: 'publish' | 'review'
	}>
>()

const standardOptionsSchema = z.strictObject({
	enabled: z.boolean().default(true),
	mode: z.enum(['publish', 'review']).optional(),
})
const parseStandardOptions = definePluginOptionsParser({
	name: 'standard workflow options',
	schema: standardOptionsSchema,
})
expectTypeOf(parseStandardOptions)
	.parameter(0)
	.toEqualTypeOf<z.input<typeof standardOptionsSchema>>()
expectTypeOf(parseStandardOptions({})).toEqualTypeOf<
	Readonly<z.output<typeof standardOptionsSchema>>
>()

// @ts-expect-error -- Plugin option schemas must produce an object root.
definePluginOptionsParser({ name: 'primitive options', schema: z.string() })

const types = defineTypegenModule('@example/workflow-plugin')
expectTypeOf(types.reference('PublishInput')).toEqualTypeOf<
	TypegenReference<'@example/workflow-plugin', 'PublishInput'>
>()

expectTypeOf(schemaPatch()).toEqualTypeOf<SchemaPatchBuilder>()

interface PublishedEvent extends JsonObject {
	readonly id: string
}

const publishedEvent = definePluginEvent<PublishedEvent>()(
	'community.workflow.published',
	{ delivery: 'optional' },
)
const publishedObserver = observePluginEvent(publishedEvent, ({ event }) => {
	expectTypeOf(event.name).toEqualTypeOf<'community.workflow.published'>()
	expectTypeOf(event.payload).toEqualTypeOf<PublishedEvent>()
})
expectTypeOf(publishedObserver).toEqualTypeOf<
	PluginEventObserver<'community.workflow.published', PublishedEvent>
>()
expectTypeOf(
	schemaPatch().addField({
		contributionId: 'state',
		field: {} as never,
		name: 'state',
	}),
).toEqualTypeOf<SchemaPatchBuilder>()

const text = defineOperationValue((value): string => String(value))
const operation = defineOperation({
	input: text,
	name: 'community.workflow.publish',
	result: text,
	target: 'application',
	transaction: 'forbidden',
	version: '1.0.0',
})
providePluginOperation({
	contributionId: 'publish',
	execute: ({ input }) => {
		expectTypeOf(input).toEqualTypeOf<string>()
		return input
	},
	operation,
})

module.plugin({
	// @ts-expect-error -- Package facts cannot be replaced per instance.
	pluginId: 'community.forged',
})
providePluginOperation({
	contributionId: 'invalid',
	// @ts-expect-error -- Handler results remain correlated with the operation token.
	execute: () => 42,
	operation,
})
