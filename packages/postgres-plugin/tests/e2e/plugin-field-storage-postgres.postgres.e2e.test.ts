import { definePluginField, UltimaBase } from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
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
	fields: () => ({ value: storedValue }),
}).with({ postgres: { table: 'adapter_bridge_items' } })

let fixture: PostgresWorkerFixture | undefined

const getFixture = (): PostgresWorkerFixture => {
	if (fixture === undefined) {
		throw new TypeError(
			'PostgreSQL plugin-field storage fixture has not started',
		)
	}
	return fixture
}

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({
		prefix: 'plugin_field_storage',
	})
}, 30_000)

afterAll(async () => {
	await fixture?.dispose()
})

describe('PostgreSQL plugin-field storage', { concurrent: false }, () => {
	it('persists portable JSON codecs and compiles structural containment', async () => {
		const worker = getFixture()
		const ultimabase = new (UltimaBase.use(
			postgresPlugin({ pool: worker.pool, schemaPolicy: 'override' }),
		))({ schemas: [BridgeItem] })

		await ultimabase.start()
		try {
			const created = await BridgeItem.createOne({
				data: { value: 'logical-value' },
				select: { value: true },
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
			}>('SELECT value FROM adapter_bridge_items WHERE id = $1', [created.id])
			expect(stored.rows).toStrictEqual([
				{ value: { value: 'logical-value', version: 1 } },
			])
			const indexes = await worker.pool.query<{ readonly indexdef: string }>(
				`SELECT indexdef FROM pg_indexes
				 WHERE schemaname = current_schema()
				   AND tablename = 'adapter_bridge_items'`,
			)
			expect(
				indexes.rows.some(({ indexdef }) => indexdef.includes('USING gin')),
			).toBe(true)
		} finally {
			await ultimabase.dispose()
		}
	})
})
