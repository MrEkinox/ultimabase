//#region format-capability
import {
	contributeApplication,
	defineCapability,
	plugin,
	provideCapability,
	requireCapability,
} from '@ultimabase/core/plugin'

/** The token both plugins agree on, instead of a service looked up by name. */
export const formatCapability = defineCapability<{
	readonly format: 'compact'
}>()({
	capabilityId: 'community.workflow-format',
	cardinality: 'single',
	compose: ([provider]) => provider,
	lifetime: 'declaration',
	version: '1.0.0',
})

const format = requireCapability(formatCapability, '^1.0.0')

export const formatProvider = plugin({
	contributions: [
		provideCapability(formatCapability, {
			value: { format: 'compact' },
		}),
	],
	core: '^0.0.0',
	id: 'community.workflow-format',
	version: '1.0.0',
})

export const formatConsumer = plugin({
	contributions: [
		format,
		contributeApplication(({ capabilities }) => ({
			exports: { format: capabilities.get(format).format },
		})),
	],
	core: '^0.0.0',
	id: 'community.workflow-consumer',
	version: '1.0.0',
})
//#endregion format-capability
