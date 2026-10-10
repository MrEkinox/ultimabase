import { UltimaBase } from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../../../../tests/fixtures/postgres-worker-fixture.js'

// ADR-0307 decision 2: atomic updates are `{ increment }` / `{ decrement }`
// objects on numeric fields, in root, nested and upsert update data.
const Counter = UltimaBase.Schema.define({
	className: 'AtomicCounter',
	fields: (field) => ({
		amount: field.decimal({ precision: 12, scale: 2 }),
		huge: field.bigint(),
		label: field.string(),
		note: field.string(),
		rating: field.float(),
		views: field.int(),
		parent: field.pointer({ target: () => Counter }),
	}),
})

const createApplication = (fixture: PostgresWorkerFixture) =>
	new (UltimaBase.use(
		postgresPlugin({ pool: fixture.pool, schemaPolicy: 'override' }),
	))({ schemas: [Counter] })

let fixture: PostgresWorkerFixture | undefined
let ultimabase: ReturnType<typeof createApplication> | undefined

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({ prefix: 'atomic' })
	ultimabase = createApplication(fixture)
	await ultimabase.start()
}, 30_000)

afterAll(async () => {
	await ultimabase?.dispose()
	await fixture?.dispose()
})

const createCounter = () =>
	Counter.createOne({
		data: {
			amount: '10.50',
			huge: 9_007_199_254_740_993n,
			label: 'counter',
			note: 'note',
			rating: 1.5,
			views: 1,
		},
	})

describe('atomic update objects (ADR-0307)', { concurrent: false }, () => {
	it('increments and decrements every numeric kind and clears with null', async () => {
		const { id } = await createCounter()

		await expect(
			Counter.updateOne({
				where: { id: { eq: id } },
				data: {
					amount: { decrement: '0.25' },
					huge: { increment: 2n },
					note: null,
					rating: { decrement: 0.25 },
					views: { increment: 4 },
				},
				select: {
					amount: true,
					huge: true,
					note: true,
					rating: true,
					views: true,
				},
			}),
		).resolves.toMatchObject({
			amount: '10.25',
			huge: 9_007_199_254_740_995n,
			note: null,
			rating: 1.25,
			views: 5,
		})
	})

	it('applies the operations in nested and upsert update branches', async () => {
		const parent = await createCounter()
		const child = await Counter.createOne({
			data: { parent: { connect: parent.id }, views: 0 },
		})

		await Counter.updateOne({
			where: { id: { eq: child.id } },
			data: { parent: { update: { views: { increment: 10 } } } },
		})
		await Counter.upsertOne({
			where: { id: { eq: child.id } },
			create: { views: 0 },
			update: { views: { decrement: 3 } },
		})

		await expect(
			Counter.findMany({
				where: { id: { in: [parent.id, child.id] } },
				orderBy: { views: 'asc' },
				select: { views: true },
			}),
		).resolves.toMatchObject([{ views: -3 }, { views: 11 }])
	})

	it('rejects operation objects on other fields, with two keys and in create data', async () => {
		const { id } = await createCounter()
		const where = { id: { eq: id } }

		await expect(
			Counter.updateOne({
				where,
				// @ts-expect-error -- Only numeric fields accept atomic operations.
				data: { label: { increment: 1 } },
			}),
		).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
		expect(() =>
			Counter.updateOne({
				where,
				// @ts-expect-error -- One operation key is allowed.
				data: { views: { increment: 1, decrement: 1 } },
			}),
		).toThrow(
			'update field views must contain exactly one of increment or decrement',
		)
		await expect(
			// @ts-expect-error -- Create data has no atomic operations.
			Counter.createOne({ data: { views: { increment: 1 } } }),
		).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
		await expect(
			Counter.findOne({ where, select: { label: true, views: true } }),
		).resolves.toMatchObject({ label: 'counter', views: 1 })
	})
})
