import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MockInstance } from 'vitest'

import { plugin } from '../../src/foundation.js'
import {
	definePluginField,
	type SchemaDefinition,
} from '../../src/schema/index.js'
import { UltimaBase } from '../../src/runtime/application/ultima-base.js'
import { databaseFilterOperatorCapabilityVersion } from '../../src/runtime/database/adapter-capabilities.js'
import { provideTestDatabaseAdapter } from './fixtures/database-adapter-capability.js'
import {
	RecordingDatabaseAdapter,
	type RecordingAdapterCapabilityOptions,
} from './fixtures/recording-database-adapter.js'

const databasePlugin = (adapter: RecordingDatabaseAdapter) =>
	plugin({
		core: '^0.0.0',
		id: 'fixture.adapter-contract-database',
		version: '0.0.0',
		contributions: [provideTestDatabaseAdapter(adapter)],
	})

const startWith = async (
	schemas: readonly SchemaDefinition[],
	options: RecordingAdapterCapabilityOptions,
): Promise<UltimaBase> => {
	const adapter = new RecordingDatabaseAdapter([], [], {}, options)
	const ultimabase = new (UltimaBase.use(databasePlugin(adapter)))({
		pluginPrivileges: { logger: false },
		schemas,
	})
	try {
		await ultimabase.start()
	} catch (error: unknown) {
		await ultimabase.dispose()
		throw error
	}
	return ultimabase
}

const partialIndexSchema = UltimaBase.Schema.define({
	className: 'StartupPartialIndex',
	fields: (field) => ({
		slug: field.string(),
		archived: field.boolean(),
	}),
	indexes: [{ fields: ['slug'], unique: true, where: { archived: false } }],
})

describe('static adapter capability checks at start (ADR-0301, ADR-0303)', () => {
	it('starts when the adapter declares partial indexes and their operators', async () => {
		const ultimabase = await startWith([partialIndexSchema], {})
		await ultimabase.dispose()
	})

	it('refuses a partial index without the partial-index capability', async () => {
		await expect(
			startWith([partialIndexSchema], { partialIndexes: false }),
		).rejects.toMatchObject({
			code: 'PLUGIN_ADAPTER_CAPABILITY_MISSING',
			internalDetails: {
				adapter: 'fixture.adapter-contract-database',
				capability: 'partial-indexes',
				field: 'slug',
				schema: 'StartupPartialIndex',
			},
		})
	})

	it('refuses a partial-index operator the adapter does not declare', async () => {
		await expect(
			startWith([partialIndexSchema], {
				filterOperators: {
					kind: 'filter-operators',
					version: databaseFilterOperatorCapabilityVersion,
					families: { boolean: ['null'] },
				},
			}),
		).rejects.toMatchObject({
			code: 'PLUGIN_ADAPTER_CAPABILITY_MISSING',
			internalDetails: {
				field: 'archived',
				operator: 'eq',
				schema: 'StartupPartialIndex',
			},
		})
	})

	it('refuses relation fields without relation predicates', async () => {
		await expect(
			startWith(
				[
					UltimaBase.Schema.define({
						className: 'StartupRelationTarget',
						fields: () => ({}),
					}),
					UltimaBase.Schema.define({
						className: 'StartupRelationSource',
						fields: (field) => ({
							targets: field.relation({ target: 'StartupRelationTarget' }),
						}),
					}),
				],
				{ relationPredicates: false },
			),
		).rejects.toMatchObject({
			code: 'PLUGIN_ADAPTER_CAPABILITY_MISSING',
			internalDetails: {
				capability: 'relation-predicates',
				field: 'targets',
				schema: 'StartupRelationSource',
			},
		})
	})

	it('refuses plugin containment fields without their capability', async () => {
		const containedField = definePluginField(
			'fixture.startup.contained',
			{},
			{
				snapshotValue: (value: unknown) => value,
				storageCodec: {
					decode: (value) => value,
					encode: (value) => value,
					format: 'json',
					version: 1,
				},
				structuralContains: { snapshotOperand: (value: unknown) => value },
			},
		)
		await expect(
			startWith(
				[
					UltimaBase.Schema.define({
						className: 'StartupContainment',
						fields: () => ({ containedField }),
					}),
				],
				{},
			),
		).rejects.toMatchObject({
			code: 'PLUGIN_ADAPTER_CAPABILITY_MISSING',
			internalDetails: {
				capability: 'plugin-field-structural-contains',
				field: 'containedField',
			},
		})
	})
})

describe('ultimabase.health() (ADR-0303)', () => {
	let error: MockInstance<typeof console.error>

	beforeEach(() => {
		error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
	})

	afterEach(() => {
		error.mockRestore()
		vi.useRealTimers()
	})

	const createApplication = (
		checkHealth: (signal: AbortSignal) => Promise<void>,
	) => {
		const adapter = new RecordingDatabaseAdapter([], [])
		Object.defineProperty(adapter, 'checkHealth', { value: checkHealth })
		return new (UltimaBase.use(databasePlugin(adapter)))({
			pluginPrivileges: { logger: false },
			schemas: [],
		})
	}

	it('reports DEGRADED before start and after stop, OK while started', async () => {
		const ultimabase = createApplication(() => Promise.resolve())
		try {
			await expect(ultimabase.health()).resolves.toBe('DEGRADED')
			await ultimabase.start()
			await expect(ultimabase.health()).resolves.toBe('OK')
			await ultimabase.stop()
			await expect(ultimabase.health()).resolves.toBe('DEGRADED')
		} finally {
			await ultimabase.dispose()
		}
	})

	it('reports DEGRADED without throwing when the database fails, logging the cause', async () => {
		const cause = new Error('connection refused: secret-host')
		const ultimabase = createApplication(() => Promise.reject(cause))
		try {
			await ultimabase.start()
			await expect(ultimabase.health()).resolves.toBe('DEGRADED')
			expect(error).toHaveBeenCalledWith(
				'[UltimaBase] Database health check failed',
				cause,
			)
		} finally {
			await ultimabase.dispose()
		}
	})

	it('reports DEGRADED after two seconds and aborts the check', async () => {
		let observed: AbortSignal | undefined
		const ultimabase = createApplication(
			(signal) =>
				new Promise<void>(() => {
					observed = signal
				}),
		)
		try {
			await ultimabase.start()
			vi.useFakeTimers()
			const status = ultimabase.health()
			await vi.advanceTimersByTimeAsync(1_999)
			expect(observed?.aborted).toBe(false)
			await vi.advanceTimersByTimeAsync(1)
			await expect(status).resolves.toBe('DEGRADED')
			expect(observed?.aborted).toBe(true)
		} finally {
			vi.useRealTimers()
			await ultimabase.dispose()
		}
	})
})
