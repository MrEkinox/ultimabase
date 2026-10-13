import process from 'node:process'

import {
	applicationRequestExecutionCapability,
	databaseAdapterCapability,
	databasePersistencePlanCapability,
	getCurrentRequest,
	UltimaBase,
} from '@ultimabase/core'
import {
	defineCapability,
	plugin,
	provideCapability,
	requireCapability,
} from '@ultimabase/core/plugin'

const requestExecution = requireCapability(
	applicationRequestExecutionCapability,
	'^1.0.0',
)
const captureCapability = defineCapability()({
	capabilityId: 'fixture.javascript-request-capture',
	version: '1.0.0',
	cardinality: 'multiple',
	lifetime: 'application',
	compose: (providers) => providers,
})
const captured = {}

const transportPlugin = plugin({
	contributions: [
		provideCapability(captureCapability, {
			contributionId: 'capture-request-executor',
			create: ({ callbacks, capabilities, owner }) => {
				captured.callbacks = callbacks
				captured.executor = capabilities.get(requestExecution)
				captured.owner = owner
				return { value: Object.freeze({ ready: true }) }
			},
		}),
		requestExecution,
	],
	core: '^0.0.0',
	id: 'fixture.javascript-request-transport',
	version: '1.0.0',
})

const unsupported = () => {
	throw new TypeError('Database execution is not expected in this fixture')
}
const databasePlugin = plugin({
	contributions: [
		provideCapability(databaseAdapterCapability, {
			contributionId: 'javascript-request-database',
			create: () => ({
				value: {
					beginTransaction: unsupported,
					capabilities: {
						persistencePlans: databasePersistencePlanCapability,
					},
					execute: unsupported,
					kind: 'database-adapter',
				},
			}),
		}),
	],
	core: '^0.0.0',
	id: 'fixture.javascript-request-database',
	version: '1.0.0',
})

const Application = UltimaBase.use(transportPlugin, databasePlugin)
const ultimabase = new Application({
	logger: false,
	schemas: [],
})
await ultimabase.start()

const result = captured.callbacks.runPlugin(captured.owner, () => {
	const context = captured.executor.createAnonymousContext({
		requestId: 'javascript-request-executor',
		source: 'fixture-http',
	})
	return captured.executor.runWithContext(context, async (activeContext) => {
		await Promise.resolve()
		return {
			access: activeContext.access,
			activeRequestId: getCurrentRequest().requestId,
			requestId: activeContext.requestId,
			source: activeContext.source,
		}
	})
})

await ultimabase.dispose()
process.stdout.write(`${JSON.stringify(await result)}\n`)
