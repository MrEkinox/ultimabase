import { immutableRecord, isPlainRecord } from '@ultimabase/shared'
import { describe, expect, it } from 'vitest'

import { applicationFixture } from '../application-fixture.js'
import {
	applicationRequestExecutionCapability,
	contributeApplication,
	contributeOperation,
	contributeOperationBinding,
	defineOperation,
	defineOperationTransport,
	defineOperationValue,
	operationTransportBinding,
	operationWireCodec,
	plugin as createPlugin,
	requireCapability,
	UltimaBase,
	type ApplicationSchemaMutationTransport,
} from '../../src/index.js'
import { provideTestDatabaseAdapter } from './fixtures/database-adapter-capability.js'
import { RecordingDatabaseAdapter } from './fixtures/recording-database-adapter.js'

// Regression for a reference defect (documented in docs/rebuild/DIFFERENCES.md):
// the reference returned class instances whose TypeScript-`private` constructor
// parameters were ordinary enumerable own properties at runtime. Any transport
// could read `exposed` (the compiled command map), `runtime` (whose `execute`
// skips envelope, cancellation and transaction-policy checks) and
// `createEngine` from the exposure. The rebuild returns frozen records whose
// only own keys are the public facade.

const messageValue = defineOperationValue((value, path) => {
	if (!isPlainRecord(value) || typeof value.message !== 'string') {
		throw new TypeError(`${path}.message must be a string`)
	}
	return immutableRecord({ message: value.message })
})
const acceptedValue = defineOperationValue((value, path) => {
	if (!isPlainRecord(value) || typeof value.accepted !== 'boolean') {
		throw new TypeError(`${path}.accepted must be a boolean`)
	}
	return immutableRecord({ accepted: value.accepted })
})
const inspectOperation = defineOperation({
	input: messageValue,
	name: 'fixture.exposure-records.inspect',
	result: acceptedValue,
	target: 'application',
	transaction: 'optional',
	version: '1.0.0',
})
const fixtureTransport = defineOperationTransport({
	name: 'fixture.transport.exposure-records',
	version: '1.0.0',
})
const fixtureBinding = operationTransportBinding({
	codec: operationWireCodec({
		decode: (value: Readonly<{ readonly text: string }>) =>
			immutableRecord({ message: value.text }),
		encode: (value) => immutableRecord({ ok: value.accepted }),
		operation: inspectOperation,
		transport: fixtureTransport,
	}),
	operation: inspectOperation,
})
const Post = UltimaBase.Schema.define({
	className: 'TransportExposureRecordPost',
	fields: (field) => ({ title: field.string() }),
})

// Internal handles the reference leaked as own properties of exposures.
const leakedHandles = ['exposed', 'runtime', 'createEngine'] as const

const createFixture = () => {
	const requestExecution = requireCapability(
		applicationRequestExecutionCapability,
		'^1.0.0',
		{ phase: 'materialization' },
	)
	const schemaMutationExposures: ApplicationSchemaMutationTransport<
		typeof fixtureTransport
	>[] = []
	const operations = createPlugin({
		core: '^0.0.0',
		id: 'fixture.exposure-records',
		permissions: {
			'operation:declare': 'Declares the exposure fixture operation.',
			'transport:expose': 'Exposes the fixture transport.',
		},
		version: '1.0.0',
		contributions: [
			contributeOperation({
				execute: () => immutableRecord({ accepted: true }),
				operation: inspectOperation,
			}),
			contributeOperationBinding(fixtureBinding),
			requestExecution,
			contributeApplication(({ capabilities }) => ({
				startTransports: () => {
					// The executor is the only public route to schema-mutation exposures.
					schemaMutationExposures.push(
						capabilities.get(requestExecution).exposeSchemaMutations({
							acknowledgeUnverifiedProtection: true,
							transport: fixtureTransport,
						}),
					)
				},
			})),
		],
	})
	const database = createPlugin({
		core: '^0.0.0',
		id: 'fixture.exposure-records-database',
		version: '1.0.0',
		contributions: [
			provideTestDatabaseAdapter(new RecordingDatabaseAdapter([], [])),
		],
	})
	const ultimabase = applicationFixture(
		new (UltimaBase.use(database, operations))({
			pluginPrivileges: { logger: false },
			schemas: [Post],
		}),
	)
	return { schemaMutationExposures, ultimabase }
}

describe('transport exposure records (reference defect regression)', () => {
	it('exposes operations through a frozen record without internal execution handles', async () => {
		const { ultimabase } = createFixture()
		await ultimabase.start()

		const exposure = ultimabase.exposeOperations({
			acknowledgeUnverifiedProtection: true,
			operations: [inspectOperation],
			transport: fixtureTransport,
		})

		// Only the public facade is observable; the reference also carried the
		// enumerable `exposed`, `runtime` and `createEngine` constructor fields.
		expect(Reflect.ownKeys(exposure).sort()).toStrictEqual([
			'execute',
			'operations',
			'transport',
		])
		for (const handle of leakedHandles) {
			expect(Object.hasOwn(exposure, handle), handle).toBe(false)
			expect(Reflect.get(exposure, handle), handle).toBeUndefined()
		}
		expect(Object.isFrozen(exposure)).toBe(true)
		expect(exposure.transport).toBe(fixtureTransport)
		expect(exposure.operations.map(({ name }) => name)).toStrictEqual([
			inspectOperation.name,
		])
	})

	it('exposes schema mutations through a frozen record without internal execution handles', async () => {
		const { schemaMutationExposures, ultimabase } = createFixture()
		await ultimabase.start()

		expect(schemaMutationExposures).toHaveLength(1)
		const [exposure] = schemaMutationExposures
		if (exposure === undefined) throw new TypeError('Expected one exposure')

		// The reference instance also carried enumerable `runtime` and
		// `createEngine` fields beside the public facade.
		expect(Reflect.ownKeys(exposure).sort()).toStrictEqual([
			'execute',
			'mutations',
			'transport',
		])
		for (const handle of leakedHandles) {
			expect(Object.hasOwn(exposure, handle), handle).toBe(false)
			expect(Reflect.get(exposure, handle), handle).toBeUndefined()
		}
		expect(Object.isFrozen(exposure)).toBe(true)
		expect(exposure.transport).toBe(fixtureTransport)
		expect(exposure.mutations).toStrictEqual([])
	})
})
