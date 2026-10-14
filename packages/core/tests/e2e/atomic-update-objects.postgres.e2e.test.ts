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

	it('rejects a projected result outside the field before the write', async () => {
		const high = await Counter.createOne({
			data: { label: 'high', views: Number.MAX_SAFE_INTEGER },
		})
		const low = await Counter.createOne({
			data: { label: 'low', views: -Number.MAX_SAFE_INTEGER },
		})
		const capped = await Counter.createOne({
			data: { amount: '9999999999.99', rating: Number.MAX_VALUE },
		})
		const unsafe = (path: readonly (number | string)[]) => ({
			code: 'VALIDATION_ERROR',
			publicDetails: { issues: [{ code: 'int.type', path }] },
		})
		const views = ['update', 0, 'views', 'value']

		await expect(
			Counter.updateOne({
				where: { id: { eq: high.id } },
				data: { views: { increment: 1 } },
			}),
		).rejects.toMatchObject(unsafe(views))
		await expect(
			Counter.updateOne({
				where: { id: { eq: low.id } },
				data: { views: { decrement: 1 } },
			}),
		).rejects.toMatchObject(unsafe(views))
		await expect(
			Counter.updateMany({
				data: [
					{ where: { id: { eq: low.id } }, data: { views: { increment: 1 } } },
					{
						where: { id: { eq: high.id } },
						data: { views: { increment: 1 } },
					},
				],
			}),
		).rejects.toMatchObject(unsafe([1, ...views]))
		await expect(
			Counter.upsertOne({
				where: { id: { eq: low.id } },
				create: { views: 0 },
				update: { views: { decrement: 2 } },
			}),
		).rejects.toMatchObject(unsafe(views))
		await expect(
			Counter.updateOne({
				where: { id: { eq: capped.id } },
				data: {
					amount: { increment: '0.01' },
					rating: { increment: Number.MAX_VALUE },
				},
			}),
		).rejects.toMatchObject({
			code: 'VALIDATION_ERROR',
			publicDetails: {
				issues: [
					{ code: 'decimal.precision', path: ['update', 0, 'amount', 'value'] },
					{ code: 'float.type', path: ['update', 1, 'rating', 'value'] },
				],
			},
		})
		// Every rejected update rolled back, the batch's valid first item included.
		await expect(
			Counter.findMany({
				where: { id: { in: [high.id, low.id, capped.id] } },
				orderBy: { views: 'asc' },
				select: { amount: true, rating: true, views: true },
			}),
		).resolves.toMatchObject([
			{ views: -Number.MAX_SAFE_INTEGER },
			{ views: Number.MAX_SAFE_INTEGER },
			{ amount: '9999999999.99', rating: Number.MAX_VALUE, views: null },
		])
	})

	it('rejects a projected nested update result before the write', async () => {
		const parent = await Counter.createOne({
			data: { views: Number.MAX_SAFE_INTEGER },
		})
		const child = await Counter.createOne({
			data: { parent: { connect: parent.id }, views: 0 },
		})

		await expect(
			Counter.updateOne({
				where: { id: { eq: child.id } },
				data: {
					views: { increment: 1 },
					parent: { update: { views: { increment: 1 } } },
				},
			}),
		).rejects.toMatchObject({
			code: 'VALIDATION_ERROR',
			// The nested update reports the path of its own update expression.
			publicDetails: {
				issues: [{ code: 'int.type', path: ['update', 0, 'views', 'value'] }],
			},
		})
		await expect(
			Counter.findMany({
				where: { id: { in: [parent.id, child.id] } },
				orderBy: { views: 'asc' },
				select: { views: true },
			}),
		).resolves.toMatchObject([{ views: 0 }, { views: Number.MAX_SAFE_INTEGER }])
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
