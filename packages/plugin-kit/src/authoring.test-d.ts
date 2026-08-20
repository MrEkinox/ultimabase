import {
	defineOperation,
	defineOperationValue,
	type FrameworkPlugin,
	type JsonObject,
	type TypegenReference,
} from '@ultimabase/core'
import { expectTypeOf } from 'vitest'

import {
	definePluginModule,
	definePluginEvent,
	observePluginEvent,
	definePluginOptionsParser,
	defineTypegenModule,
	providePluginOperation,
	schemaPatch,
	type PluginModule,
	type PluginOptionsParser,
	type SchemaPatchBuilder,
	type PluginEventObserver,
} from './index.js'

const module = definePluginModule({
	core: '^2.0.0',
	pluginId: 'community.workflow',
	version: '1.4.0',
})
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
