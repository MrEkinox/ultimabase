import { describe, expect, it } from 'vitest'

import { RecordingDatabaseAdapter } from '../../../tests/runtime/fixtures/recording-database-adapter.js'
import { provideTestDatabaseAdapter } from '../../../tests/runtime/fixtures/database-adapter-capability.js'
import { runWithRequestEngine } from '../../index.js'
import {
	defineCapability,
	plugin,
	provideCapability,
	readCurrentCapabilityProvider,
	requestSources,
} from '../../plugin.js'
import { readApplicationPluginOwner } from '../../plugins/callback-execution.js'
import { UltimaBase } from '../application/ultima-base.js'
import { anonymous } from '../application/plugin-authority.js'
import { readRequestEngineApplication } from '../engine/request-engine.js'

interface Greeter {
	greet(name: string): string
}

const greeterCapability = defineCapability<Greeter>()({
	capabilityId: 'fixture.current-capability.greeter',
	version: '1.0.0',
	cardinality: 'single',
	lifetime: 'application',
	compose: ([provider]) => provider,
})

const databasePlugin = () =>
	plugin({
		core: '^0.0.0',
		id: 'fixture.current-capability-database',
		version: '1.0.0',
		contributions: [
			provideTestDatabaseAdapter(new RecordingDatabaseAdapter([], [])),
		],
	})

const greeter: Greeter = { greet: (name) => `hello ${name}` }
const providerPlugin = () =>
	plugin({
		core: '^0.0.0',
		id: 'fixture.current-capability-provider',
		version: '1.0.0',
		contributions: [
			provideCapability(greeterCapability, {
				contributionId: 'greeter',
				create: () => ({ value: greeter }),
			}),
		],
	})

const startApplication = async (withProvider: boolean) => {
	const Application = UltimaBase.use(
		databasePlugin(),
		...(withProvider ? [providerPlugin()] : []),
	)
	const ultimabase = new Application({ logger: false, schemas: [] })
	await ultimabase.start()
	return ultimabase
}

describe('readCurrentCapabilityProvider (ADR-0329)', () => {
	it('reads the provider of the active request and attributes its calls', async () => {
		await using ultimabase = await startApplication(true)
		const engine = anonymous(ultimabase, {
			requestId: 'current-capability',
			source: requestSources.internal,
		})
		const application = readRequestEngineApplication(engine)

		const provider = runWithRequestEngine(engine, () =>
			readCurrentCapabilityProvider(greeterCapability),
		)

		expect(provider?.value).toBe(greeter)
		expect(
			provider?.run(() => readApplicationPluginOwner(application)),
		).toEqual({ pluginId: 'fixture.current-capability-provider' })
		expect(provider?.run(() => greeter.greet('core'))).toBe('hello core')
		expect(Object.isFrozen(provider)).toBe(true)
	})

	it('is undefined without a provider and fails outside a request', async () => {
		await using ultimabase = await startApplication(false)
		const engine = anonymous(ultimabase, {
			requestId: 'no-current-capability',
			source: requestSources.internal,
		})

		expect(
			runWithRequestEngine(engine, () =>
				readCurrentCapabilityProvider(greeterCapability),
			),
		).toBeUndefined()
		expect(() => readCurrentCapabilityProvider(greeterCapability)).toThrow()
	})
})
