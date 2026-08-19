import {
	defineOperation,
	defineOperationValue,
	definePlugin,
	operationHandler,
	provideOperationHandler,
	requireCapability,
	UltimaBase,
} from '@ultimabase/core'
import { immutableRecord } from '@ultimabase/shared'
import { describe, expect, it } from 'vitest'

import {
	postgresPhysicalColumn,
	postgresRawAdapterCapability,
	postgresUpgrade,
	type PostgresRawAdapterFacade,
} from './adapter-capabilities.js'
import type {
	PostgresPool,
	PostgresPoolClient,
	PostgresQueryResult,
} from './connection/contracts.js'
import { postgresPlugin } from './plugin/postgres-plugin.js'

class RawFixtureClient implements PostgresPoolClient {
	readonly queries: string[] = []
	released = false

	query(queryText: string): Promise<PostgresQueryResult> {
		this.queries.push(queryText)
		return Promise.resolve({ rows: [{ ok: true }] })
	}

	release(): void {
		this.released = true
	}
}

class RawFixturePool implements PostgresPool {
	readonly clients: RawFixtureClient[] = []
	ended = false

	connect(): Promise<PostgresPoolClient> {
		const client = new RawFixtureClient()
		this.clients.push(client)
		return Promise.resolve(client)
	}

	end(): Promise<void> {
		this.ended = true
		return Promise.resolve()
	}

	query(): Promise<PostgresQueryResult> {
		return Promise.resolve({ rows: [] })
	}
}

const inputValue = defineOperationValue((value: unknown) => {
	if (typeof value !== 'string') throw new TypeError('input must be a string')
	return value
})
const resultValue = defineOperationValue((value: unknown) => {
	if (typeof value !== 'boolean') throw new TypeError('result must be boolean')
	return value
})

describe('PostgreSQL adapter capabilities', () => {
	it('rejects raw SQL fragments as physical column types', () => {
		expect(() =>
			postgresPhysicalColumn({
				column: {
					name: 'unsafe',
					nullable: true,
					// @ts-expect-error -- Runtime validation protects untyped bridge metadata.
					type: 'text; DROP TABLE users',
				},
				contributionId: 'unsafe-column',
				table: 'items',
			}),
		).toThrow('PostgreSQL physical column metadata is invalid')
	})

	it('exposes only inert PostgreSQL identity during setup', async () => {
		const pool = new RawFixturePool()
		const rawRequirement = requireCapability(
			postgresRawAdapterCapability,
			'^1.0.0',
		)
		const setupConsumer = definePlugin({
			capabilities: { requires: [rawRequirement] },
			core: '^0.0.0',
			pluginId: 'fixture.postgres-raw-setup-consumer',
			privileges: [
				{ name: 'adapter:raw', reason: 'Reads inert setup identity.' },
			] as const,
			setup: ({ adapters }) =>
				adapters.withRaw(rawRequirement, (raw) => ({
					clientsDuringSetup: pool.clients.length,
					dialect: raw.dialect,
					scope: raw.scope,
				})),
			version: '1.0.0',
		})
		const ultimabase = new UltimaBase({
			pluginPrivileges: { logger: false },
			plugins: [
				postgresPlugin({ pool, schemaPolicy: 'ignore' }),
				setupConsumer,
			],
			schemas: [],
		})

		await ultimabase.start()
		expect(
			ultimabase.application.getPlugin('fixture.postgres-raw-setup-consumer'),
		).toStrictEqual({
			clientsDuringSetup: 0,
			dialect: 'postgres',
			scope: 'setup',
		})
		await ultimabase.dispose()
	})

	it('provides transaction raw leases and attributed bridge metadata', async () => {
		const pool = new RawFixturePool()
		const rawRequirement = requireCapability(
			postgresRawAdapterCapability,
			'^1.0.0',
		)
		const rawOperation = defineOperation({
			input: inputValue,
			name: 'fixture.postgres.raw-operation',
			result: resultValue,
			target: 'application',
			transaction: 'required',
			version: '1.0.0',
		})
		let escaped: PostgresRawAdapterFacade | undefined
		const operationPlugin = definePlugin({
			capabilities: {
				provides: [
					provideOperationHandler({
						contributionId: 'raw-operation',
						create: () => ({
							value: operationHandler({
								execute: ({ adapters }) =>
									adapters.withRaw(rawRequirement, async (raw) => {
										escaped = raw
										if (raw.scope !== 'transaction') return false
										const result = await raw.query('SELECT 1')
										return result.rows.length === 1
									}),
								operation: rawOperation,
							}),
						}),
					}),
				],
				requires: [rawRequirement],
			},
			core: '^0.0.0',
			declare: ({ operations }) => {
				operations.declare(rawOperation)
			},
			pluginId: 'fixture.postgres-raw-consumer',
			privileges: [
				{ name: 'adapter:raw', reason: 'Runs one raw transaction query.' },
				{ name: 'operation:declare', reason: 'Declares the raw operation.' },
			] as const,
			version: '1.0.0',
		})
		const bridgePlugin = definePlugin({
			capabilities: {
				provides: [
					postgresPhysicalColumn({
						column: {
							name: 'workflow_state',
							nullable: true,
							type: 'text',
						},
						contributionId: 'workflow-column',
						normalizedStaticOptions: { indexed: false },
						table: 'workflow_items',
					}),
					postgresUpgrade({
						contributionId: 'workflow-upgrade',
						from: '^1.0.0',
						intent: immutableRecord({ rename: 'state-to-workflow-state' }),
						target: {
							contributionId: 'workflow-column',
							pluginId: 'fixture.workflow',
						},
						to: '2.0.0',
					}),
				],
			},
			core: '^0.0.0',
			instanceId: 'primary',
			pluginId: 'fixture.workflow-postgres',
			privileges: [
				{
					name: 'adapter:consume',
					reason: 'Adds PostgreSQL physical metadata.',
				},
				{
					name: 'migration:contribute',
					reason: 'Adds explicit upgrade intent.',
				},
			] as const,
			version: '2.0.0',
		})
		const database = postgresPlugin({ pool, schemaPolicy: 'ignore' })
		const ultimabase = new UltimaBase({
			pluginPrivileges: { logger: false },
			plugins: [database, bridgePlugin, operationPlugin],
			schemas: [],
		})

		await ultimabase.start()
		expect(await ultimabase.operation(rawOperation).execute('run')).toBe(true)
		expect(pool.clients.at(-1)?.queries).toStrictEqual([
			'BEGIN',
			'SELECT 1',
			'COMMIT',
		])
		expect(() =>
			escaped?.scope === 'transaction' ? escaped.query('SELECT 2') : undefined,
		).toThrow(expect.objectContaining({ code: 'TRANSACTION_ERROR' }))
		const metadata = ultimabase.application.getPlugin(
			'@ultimabase/postgres-plugin',
		).adapterMetadata
		expect(metadata.physicalSchema[0]).toMatchObject({
			contributionId: 'workflow-column',
			instanceId: 'primary',
			packageVersion: '2.0.0',
			pluginId: 'fixture.workflow-postgres',
		})
		expect(metadata.migrations[0]).toMatchObject({
			contributionId: 'workflow-upgrade',
			pluginId: 'fixture.workflow-postgres',
		})
		await ultimabase.dispose()
		expect(pool.ended).toBe(false)
	})
})
