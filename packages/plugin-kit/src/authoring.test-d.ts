import {
	contributeApplication,
	contributeOperation,
	defineOperation,
	defineOperationValue,
	plugin,
	defineTypegenReference,
	type JsonObject,
	type PluginExports,
} from '@ultimabase/core'
import { expectTypeOf } from 'vitest'
import { z } from 'zod'

import {
	defineOutputDescriptor,
	definePluginFieldOption,
	definePluginEvent,
	observePluginEvent,
	definePluginOptionsParser,
	schemaPatch,
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

const contextualOption = definePluginFieldOption({
	contexts: ['stored', 'embedded'],
	normalize: (value: unknown) => String(value),
	protocolVersion: 1,
	typegen: false,
})
expectTypeOf(contextualOption.contexts).toEqualTypeOf<
	readonly ('stored' | 'embedded' | 'virtual' | 'output')[]
>()
const workflowPlugin = plugin({
	id: 'community.workflow',
	version: '1.4.0',
	core: '^2.0.0',
	instanceId: 'editorial',
	peers: [{ pluginId: 'community.protocol', version: '^1.0.0' }] as const,
	contributions: [
		contributeApplication(() => ({
			exports: { ready: true as const },
		})),
	],
})
expectTypeOf(
	workflowPlugin.manifest.identity.pluginId,
).toEqualTypeOf<'community.workflow'>()

expectTypeOf(workflowPlugin.manifest.identity.instanceId).toEqualTypeOf<
	'editorial' | undefined
>()
expectTypeOf(workflowPlugin.manifest.capabilities.provides).toEqualTypeOf<
	readonly []
>()
expectTypeOf(workflowPlugin.peers?.[0]?.pluginId).toEqualTypeOf<
	'community.protocol' | undefined
>()
expectTypeOf<PluginExports<typeof workflowPlugin>>().toEqualTypeOf<
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

const publishInputReference = defineTypegenReference({
	exportName: 'PublishInput',
	module: '@example/workflow-plugin',
})
expectTypeOf(publishInputReference.exportName).toEqualTypeOf<'PublishInput'>()

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
contributeOperation({
	execute: ({ input }) => {
		expectTypeOf(input).toEqualTypeOf<string>()
		return input
	},
	operation,
})

plugin({
	// @ts-expect-error -- The canonical identity key is id.
	pluginId: 'community.forged',
	id: 'community.workflow',
	version: '1.4.0',
	core: '^2.0.0',
	contributions: [],
})
contributeOperation({
	// @ts-expect-error -- Handler results remain correlated with the operation token.
	execute: () => 42,
	operation,
})
