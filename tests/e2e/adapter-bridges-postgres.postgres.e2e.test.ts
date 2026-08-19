import {
	adapterValueStorageCapability,
	defineOperation,
	defineOperationValue,
	definePlugin,
	definePluginField,
	operationHandler,
	provideOperationHandler,
	requireCapability,
	Schema,
	UltimaBase,
} from '@ultimabase/core'
import {
	postgresPhysicalColumn,
	postgresPlugin,
	postgresRawAdapterCapability,
	postgresTable,
} from '@ultimabase/postgres-plugin'
import { isPlainRecord } from '@ultimabase/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from './postgres-worker-fixture.js'

const storedValue = definePluginField(
	'fixture.adapter-bridge-value',
	{ validation: { required: true } },
	{
		snapshotValue: (value: unknown, path: string): string => {
			if (typeof value !== 'string')
				throw new TypeError(`${path} must be a string`)
			return value
		},
		storageCodec: {
			decode: (value: unknown): string => {
				if (
					!isPlainRecord(value) ||
					value.version !== 1 ||
					typeof value.value !== 'string'
				) {
					throw new TypeError('Stored adapter bridge value is invalid')
				}
				return value.value
			},
			encode: (value: string) => ({ value, version: 1 }),
			format: 'json',
			version: 1,
		},
	},
)

const BridgeItem = Schema.define({
	className: 'AdapterBridgeItem',
	extensions: [postgresTable({ name: 'adapter_bridge_items' })],
	fields: () => ({ value: storedValue }),
})

const operationInput = defineOperationValue((value: unknown) => {
	if (typeof value !== 'string') throw new TypeError('input must be a string')
	return value
})
const operationResult = defineOperationValue((value: unknown) => {
	if (typeof value !== 'boolean') throw new TypeError('result must be boolean')
	return value
})
const rollbackOperation = defineOperation({
	input: operationInput,
	name: 'fixture.adapter-bridge.rollback',
	result: operationResult,
	target: 'application',
	transaction: 'required',
	version: '1.0.0',
})

let fixture: PostgresWorkerFixture | undefined

const getFixture = (): PostgresWorkerFixture => {
	if (fixture === undefined) {
		throw new TypeError('PostgreSQL adapter bridge fixture has not started')
	}
	return fixture
}

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({ prefix: 'adapter_bridges' })
}, 30_000)

afterAll(async () => {
	await fixture?.dispose()
})

describe('PostgreSQL adapter bridges', { concurrent: false }, () => {
	it('compiles portable codecs, physical metadata, and raw rollback independently', async () => {
		const worker = getFixture()
		await worker.pool.query(
			'CREATE TABLE adapter_bridge_raw_probe (value text NOT NULL)',
		)
		const storageRequirement = requireCapability(
			adapterValueStorageCapability,
			'^1.0.0',
		)
		const rawRequirement = requireCapability(
			postgresRawAdapterCapability,
			'^1.0.0',
		)
		const logicalPlugin = definePlugin({
			capabilities: { requires: [storageRequirement] },
			core: '^0.0.0',
			pluginId: 'fixture.portable-stored-value',
			privileges: [
				{ name: 'adapter:consume', reason: 'Requires JSON value storage.' },
			] as const,
			version: '1.0.0',
		})
		const physicalBridge = definePlugin({
			capabilities: {
				provides: [
					postgresPhysicalColumn({
						column: {
							name: 'workflow_state',
							nullable: true,
							type: 'text',
						},
						contributionId: 'workflow-state',
						normalizedStaticOptions: { initial: 'pending' },
						table: 'adapter_bridge_items',
					}),
				],
			},
			core: '^0.0.0',
			instanceId: 'primary',
			pluginId: 'fixture.workflow-postgres',
			privileges: [
				{ name: 'adapter:consume', reason: 'Adds one physical column.' },
			] as const,
			version: '1.0.0',
		})
		const rawPlugin = definePlugin({
			capabilities: {
				provides: [
					provideOperationHandler({
						contributionId: 'rollback-handler',
						create: () => ({
							value: operationHandler({
								execute: ({ adapters, input }) =>
									adapters.withRaw(rawRequirement, async (raw) => {
										if (raw.scope !== 'transaction') {
											throw new TypeError('transaction raw facade required')
										}
										await raw.query(
											'INSERT INTO adapter_bridge_raw_probe (value) VALUES ($1)',
											[input],
										)
										throw new Error('rollback fixture')
									}),
								operation: rollbackOperation,
							}),
						}),
					}),
				],
				requires: [rawRequirement],
			},
			core: '^0.0.0',
			declare: ({ operations }) => {
				operations.declare(rollbackOperation)
			},
			pluginId: 'fixture.postgres-raw-rollback',
			privileges: [
				{ name: 'adapter:raw', reason: 'Exercises PostgreSQL rollback.' },
				{
					name: 'operation:declare',
					reason: 'Declares the rollback operation.',
				},
			] as const,
			version: '1.0.0',
		})
		const ultimabase = new UltimaBase({
			plugins: [
				postgresPlugin({ pool: worker.pool, schemaPolicy: 'override' }),
				logicalPlugin,
				physicalBridge,
				rawPlugin,
			],
			schemas: [BridgeItem],
		})

		await ultimabase.start()
		try {
			const created = await BridgeItem.createOne(
				{ data: { value: 'logical-value' } },
				{ ultimabase },
			)
			expect(created.value).toBe('logical-value')
			const stored = await worker.pool.query<{
				readonly value: unknown
				readonly workflow_state: null
			}>(
				'SELECT value, workflow_state FROM adapter_bridge_items WHERE id = $1',
				[created.id],
			)
			expect(stored.rows).toStrictEqual([
				{
					value: { value: 'logical-value', version: 1 },
					workflow_state: null,
				},
			])
			await expect(
				ultimabase.operation(rollbackOperation).execute('transient'),
			).rejects.toMatchObject({
				code: 'PLUGIN_OPERATION_INVALID',
				internalDetails: { kind: 'operation-handler-failed' },
			})
			const probe = await worker.pool.query<{ readonly count: string }>(
				'SELECT count(*)::text AS count FROM adapter_bridge_raw_probe',
			)
			expect(probe.rows).toStrictEqual([{ count: '0' }])
			const metadata = ultimabase.application.getPlugin(
				'@ultimabase/postgres-plugin',
			).adapterMetadata.physicalSchema[0]
			expect(metadata).toMatchObject({
				contributionId: 'workflow-state',
				instanceId: 'primary',
				normalizedStaticOptions: { initial: 'pending' },
				packageVersion: '1.0.0',
				pluginId: 'fixture.workflow-postgres',
				protocolVersion: 1,
			})
		} finally {
			await ultimabase.dispose()
		}
	})
})
