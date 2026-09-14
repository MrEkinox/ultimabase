import {
	defineCapability,
	definePlugin,
	provideCapability,
	requireCapability,
} from '@ultimabase/core'

export const formatCapability = defineCapability<{
	readonly format: 'compact'
}>()({
	capabilityId: 'community.workflow-format',
	cardinality: 'single',
	compose: ([provider]) => provider,
	lifetime: 'declaration',
	version: '1.0.0',
})

export const queueCapability = defineCapability<{
	readonly enqueue: (message: string) => Promise<void>
}>()({
	capabilityId: 'community.workflow-queue',
	cardinality: 'single',
	compose: ([provider]) => provider,
	lifetime: 'application',
	version: '1.0.0',
})

export const workflowInfrastructurePlugin = definePlugin({
	capabilities: {
		provides: [
			provideCapability(formatCapability, {
				contributionId: 'compact-format',
				value: { format: 'compact' },
			}),
			provideCapability(queueCapability, {
				contributionId: 'memory-queue',
				create: () => ({
					value: { enqueue: () => Promise.resolve() },
				}),
			}),
		],
	},
	core: '^0.0.0',
	pluginId: 'community.workflow-infrastructure',
	version: '1.0.0',
})

const format = requireCapability(formatCapability, '^1.0.0')

export const workflowConsumerPlugin = definePlugin({
	capabilities: { requires: [format] },
	core: '^0.0.0',
	pluginId: 'community.workflow-consumer',
	setup: ({ capabilities }) => ({ format: capabilities.get(format).format }),
	version: '1.0.0',
})
