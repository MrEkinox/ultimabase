import {
	applicationRequestExecutionCapability,
	type ApplicationRequestExecutor,
} from '@ultimabase/core'
import {
	defineCapability,
	plugin,
	provideCapability,
	requireCapability,
	withPluginPrivileges,
	type ApplicationCallbackExecutor,
	type PluginIdentity,
} from '@ultimabase/core/plugin'

export interface RestMutationExecutionHarness {
	callbacks?: ApplicationCallbackExecutor
	executor?: ApplicationRequestExecutor
	owner?: PluginIdentity
}

export const restMutationRequestExecutionRequirement = requireCapability(
	applicationRequestExecutionCapability,
	'^1.0.0',
)

const harnessCapability = defineCapability<Readonly<{ ready: true }>>()({
	capabilityId: 'fixture.rest-mutation-postgres-harness',
	version: '1.0.0',
	cardinality: 'single',
	lifetime: 'application',
	compose: ([value]) => value,
})

export const createRestMutationExecutionHarnessPlugin = (
	harness: RestMutationExecutionHarness,
) =>
	plugin({
		core: '^0.0.0',
		id: 'fixture.rest-mutation-postgres-harness',
		version: '1.0.0',
		permissions: {
			'authority:elevate':
				'Verifies the REST mutation PostgreSQL Master fixture.',
		},
		contributions: [
			withPluginPrivileges(
				provideCapability(harnessCapability, {
					contributionId: 'capture',
					create: ({ callbacks, capabilities, owner }) => {
						harness.callbacks = callbacks
						harness.executor = capabilities.get(
							restMutationRequestExecutionRequirement,
						)
						harness.owner = owner
						return { value: { ready: true } }
					},
				}),
				['authority:elevate'],
			),
			restMutationRequestExecutionRequirement,
		],
	})

const readHarness = (harness: RestMutationExecutionHarness) => {
	if (
		harness.callbacks === undefined ||
		harness.executor === undefined ||
		harness.owner === undefined
	) {
		throw new TypeError('REST mutation PostgreSQL harness is unavailable')
	}
	return {
		callbacks: harness.callbacks,
		executor: harness.executor,
		owner: harness.owner,
	}
}

export const runAsRestMutationExecutionHarness = <TResult>(
	harness: RestMutationExecutionHarness,
	callback: (executor: ApplicationRequestExecutor) => TResult,
): TResult => {
	const ready = readHarness(harness)
	return ready.callbacks.runPlugin(ready.owner, () => callback(ready.executor))
}
