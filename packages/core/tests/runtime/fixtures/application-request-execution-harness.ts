import {
	defineCapability,
	plugin as createPlugin,
	contributeApplication,
	provideCapability,
	requireCapability,
	withPluginPrivileges,
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
) => {
	const provider = provideCapability(harnessCapability, {
		contributionId: 'request-execution-harness',
		create: ({ callbacks, capabilities, owner }) => {
			harness.callbacks = callbacks
			harness.executor = capabilities.get(requestExecutionRequirement)
			harness.owner = owner
			return { value: { ready: true } }
		},
	})
	return createPlugin({
		core: '^0.0.0',
		id: options.pluginId ?? 'fixture.application-request-consumer',
		...(options.instanceId === undefined
			? {}
			: { instanceId: options.instanceId }),
		version: '0.0.0',
		permissions:
			options.withElevation === true
				? {
						'authority:elevate':
							'Verifies transport Master credentials in the fixture.',
					}
				: undefined,
		contributions: [
			options.withElevation === true
				? withPluginPrivileges(provider, ['authority:elevate'])
				: provider,
			requestExecutionRequirement,
			...(options.failStart === true
				? [
						contributeApplication(() => ({
							exports: undefined,
							startRuntime: () => {
								runAsRequestExecutionHarness(harness, (executor) =>
									executor.createAnonymousContext({
										requestId: 'during-startup',
										source: 'fixture',
									}),
								)
							},
						})),
					]
				: []),
		],
	})
}

export const createRequestExecutionDatabasePlugin = (
	adapter = new RecordingDatabaseAdapter([], []),
) =>
	createPlugin({
		core: '^0.0.0',
		id: 'fixture.application-request-database',
		version: '0.0.0',
		contributions: [provideTestDatabaseAdapter(adapter)],
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
