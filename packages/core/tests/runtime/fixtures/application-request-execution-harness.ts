import {
	defineCapability,
	definePlugin,
	provideCapability,
	requireCapability,
	type ApplicationCallbackExecutor,
	type PluginIdentity,
} from '../../../src/foundation.js'
import {
	applicationRequestExecutionCapability,
	type ApplicationRequestExecutor,
} from '../../../src/runtime/application/application-request-execution.js'

import { provideTestDatabaseAdapter } from './database-adapter-capability.js'
import { RecordingDatabaseAdapter } from './recording-database-adapter.js'

export interface RequestExecutionHarness {
	callbacks?: ApplicationCallbackExecutor
	executor?: ApplicationRequestExecutor
	owner?: PluginIdentity
}

const requestExecutionRequirement = requireCapability(
	applicationRequestExecutionCapability,
	'^1.0.0',
)

const harnessCapability = defineCapability<
	Readonly<{ ready: true }>,
	readonly Readonly<{ ready: true }>[]
>()({
	capabilityId: 'fixture.application-request-harness',
	version: '1.0.0',
	cardinality: 'multiple',
	lifetime: 'application',
	compose: (providers) => providers,
})

export const createRequestExecutionHarnessPlugin = (
	harness: RequestExecutionHarness,
	options: Readonly<{
		failStart?: boolean
		instanceId?: string
		pluginId?: string
		withElevation?: boolean
	}> = {},
) =>
	definePlugin({
		core: '^0.0.0',
		pluginId: options.pluginId ?? 'fixture.application-request-consumer',
		...(options.instanceId === undefined
			? {}
			: { instanceId: options.instanceId }),
		version: '0.0.0',
		privileges: options.withElevation
			? [
					{
						name: 'authority:elevate',
						reason: 'Verifies transport Master credentials in the fixture.',
					},
				]
			: [],
		capabilities: {
			requires: [requestExecutionRequirement],
			provides: [
				provideCapability(harnessCapability, {
					contributionId: 'request-execution-harness',
					create: ({ callbacks, capabilities, owner }) => {
						harness.callbacks = callbacks
						harness.executor = capabilities.get(requestExecutionRequirement)
						harness.owner = owner
						return { value: { ready: true } }
					},
				}),
			],
		},
		hooks: options.failStart
			? {
					startRuntime: () => {
						runAsRequestExecutionHarness(harness, (executor) =>
							executor.createAnonymousContext({
								requestId: 'during-startup',
								source: 'fixture',
							}),
						)
					},
				}
			: {},
	})

export const createRequestExecutionDatabasePlugin = (
	adapter = new RecordingDatabaseAdapter([], []),
) =>
	definePlugin({
		core: '^0.0.0',
		pluginId: 'fixture.application-request-database',
		version: '0.0.0',
		capabilities: {
			provides: [provideTestDatabaseAdapter(adapter)],
		},
	})

export const readRequestExecutionHarness = (
	harness: RequestExecutionHarness,
): Readonly<{
	callbacks: ApplicationCallbackExecutor
	executor: ApplicationRequestExecutor
	owner: PluginIdentity
}> => {
	if (
		harness.callbacks === undefined ||
		harness.executor === undefined ||
		harness.owner === undefined
	) {
		throw new TypeError('Request execution harness is not ready')
	}
	return {
		callbacks: harness.callbacks,
		executor: harness.executor,
		owner: harness.owner,
	}
}

export const runAsRequestExecutionHarness = <TResult>(
	harness: RequestExecutionHarness,
	callback: (executor: ApplicationRequestExecutor) => TResult,
): TResult => {
	const ready = readRequestExecutionHarness(harness)
	return ready.callbacks.runPlugin(ready.owner, () => callback(ready.executor))
}
