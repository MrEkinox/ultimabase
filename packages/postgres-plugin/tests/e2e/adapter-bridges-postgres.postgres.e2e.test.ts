import {
	adapterValueStorageCapability,
	contributeOperation,
	defineOperation,
	defineOperationValue,
	plugin,
	definePluginField,
	requireCapability,
	UltimaBase,
} from '@ultimabase/core'
import {
	postgresPhysicalColumn,
	postgresPlugin,
	postgresRawAdapterCapability,
} from '@ultimabase/postgres-plugin'
import { isPlainRecord } from '@ultimabase/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../../../../tests/fixtures/postgres-worker-fixture.js'

const storedValue = definePluginField(
	'fixture.adapter-bridge-value',
	{ indexed: true, required: true },
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
		structuralContains: {
			snapshotOperand: (
				value: unknown,
				path: string,
			): Readonly<{ value: string }> => {
				if (!isPlainRecord(value) || typeof value.value !== 'string') {
					throw new TypeError(`${path} must contain a string value`)
				}

				return Object.freeze({ value: value.value })
			},
		},
	},
)

const BridgeSchemaApplication = UltimaBase.use(
	postgresPlugin({ url: 'postgresql://fixture' }),
)
const BridgeItem = BridgeSchemaApplication.Schema.define({
	className: 'AdapterBridgeItem',
	postgres: { table: 'adapter_bridge_items' },
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
		const logicalPlugin = plugin({
			core: '^0.0.0',
			id: 'fixture.portable-stored-value',
			permissions: { 'adapter:consume': 'Requires JSON value storage.' },
			version: '1.0.0',
			contributions: [storageRequirement],
		})
		const physicalBridge = plugin({
			core: '^0.0.0',
			instanceId: 'primary',
			id: 'fixture.workflow-postgres',
			permissions: { 'adapter:consume': 'Adds one physical column.' },
			version: '1.0.0',
			contributions: [
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
		})
		const rawPlugin = plugin({
			core: '^0.0.0',
			id: 'fixture.postgres-raw-rollback',
			permissions: {
				'adapter:raw': 'Exercises PostgreSQL rollback.',
				'operation:declare': 'Declares the rollback operation.',
			},
			version: '1.0.0',
			contributions: [
				rawRequirement,
				contributeOperation({
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
			],
		})
		const ultimabase = new (UltimaBase.use(
			postgresPlugin({ pool: worker.pool, schemaPolicy: 'override' }),
			logicalPlugin,
			physicalBridge,
			rawPlugin,
		))({ schemas: [BridgeItem] })

		await ultimabase.start()
		try {
			const created = await BridgeItem.createOne({
				data: { value: 'logical-value' },
			})
			expect(created.value).toBe('logical-value')
			await BridgeItem.createOne({ data: { value: 'unrelated-value' } })
			const contained = await BridgeItem.findMany({
				select: { id: true, value: true },
				where: { value: { contains: { value: 'logical-value' } } },
			})
			expect(contained).toHaveLength(1)
			expect(contained[0]).toMatchObject({
				id: created.id,
				value: 'logical-value',
			})
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
			const indexes = await worker.pool.query<{ readonly indexdef: string }>(
				`SELECT indexdef FROM pg_indexes
				 WHERE schemaname = current_schema()
				   AND tablename = 'adapter_bridge_items'`,
			)
			expect(
				indexes.rows.some(({ indexdef }) => indexdef.includes('USING gin')),
			).toBe(true)
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
			const metadata = ultimabase.plugin('@ultimabase/postgres-plugin')
				.adapterMetadata.physicalSchema[0]
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
