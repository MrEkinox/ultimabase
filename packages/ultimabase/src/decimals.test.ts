// Decimal fields (D-145): exact strings at their scale, refused rather than
// rounded, typed as strings except an average.
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	expectTypeOf,
	it,
} from 'vitest'
import { z } from 'zod'
import type { FieldBuilders, PluginTypes } from './index.ts'
import {
	defineApp,
	defineFieldType,
	defineModel,
	definePlugin,
	master,
	memory,
} from './index.ts'
import { schemaOf } from './lifecycle.ts'

const M = { as: master }
const manifest = {
	name: 'test-money',
	version: '1.0.0',
	peerDependencies: { ultimabase: '*' },
}

const Invoice = defineModel({
	name: 'Invoice',
	fields: (f) => ({
		total: f.decimal({ precision: 6, scale: 2 }),
		rate: f.decimal({
			precision: 3,
			scale: 0,
			optional: true,
			validate: z.string().max(2),
		}),
		count: f.number({ optional: true }),
	}),
})

let app: ReturnType<typeof defineApp>
beforeEach(async () => {
	app = defineApp({ database: memory(), models: [Invoice] })
	await app.start()
})
afterEach(async () => app.stop())

const total =
	"Expected a decimal string of at most 6 digits, 2 after the point, such as '12.50'."
const refused = (path: string, message: string) => ({
	code: 'VALIDATION_FAILED',
	details: { issues: [{ path: [path], message }] },
})

/** Resolves a model whose decimal field has these digits. */
const field = (precision: number, scale: number) => () => {
	const Bad = defineModel({
		name: 'Bad',
		fields: (f) => ({ value: f.decimal({ precision, scale }) }),
	})
	schemaOf({ database: memory(), models: [Bad] })
}

describe('a decimal field', () => {
	it('takes a precision from 1 to 1000 and a scale up to it', () => {
		expect(field(0, 0)).toThrow('f.decimal() takes a precision from 1 to 1000.')
		expect(field(1001, 0)).toThrow(
			'f.decimal() takes a precision from 1 to 1000.',
		)
		expect(field(2.5, 0)).toThrow(
			'f.decimal() takes a precision from 1 to 1000.',
		)
		expect(field(4, 5)).toThrow(
			'f.decimal() takes a scale from 0 to its precision, 4.',
		)
		expect(field(4, -1)).toThrow(
			'f.decimal() takes a scale from 0 to its precision, 4.',
		)
		expect(field(1000, 1000)).not.toThrow()
	})

	it('refuses a number, a malformed string and too many digits', async () => {
		for (const value of [12.5, '1e3', '12.', '.5', '+1', '12.345', '10000']) {
			await expect(
				// @ts-expect-error: a decimal is a string.
				Invoice.create({ data: { total: value } }, M),
			).rejects.toMatchObject(refused('total', total))
		}
		const fits = await Invoice.create({ data: { total: '-9999.990' } }, M)
		expect(fits.total).toBe('-9999.99')
	})

	it('runs its validator on the value as sent', async () => {
		await expect(
			Invoice.create({ data: { total: '1', rate: '100' } }, M),
		).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
		const created = await Invoice.create({ data: { total: '1', rate: '7' } }, M)
		expect(created.rate).toBe('7')
	})

	it('refuses a filter operand it could not hold', async () => {
		await Invoice.create({ data: { total: '1.50' } }, M)
		expect(
			await Invoice.count({ where: { total: { equals: '1.5' } } }, M),
		).toBe(1)
		await expect(
			Invoice.findMany({ where: { total: { gt: '1.505' } } }, M),
		).rejects.toMatchObject({
			code: 'INVALID_QUERY',
			message: 'where.total.gt does not fit Invoice.total.',
		})
		await expect(
			// @ts-expect-error: a decimal has no text operators.
			Invoice.findMany({ where: { total: { contains: '1' } } }, M),
		).rejects.toMatchObject({ code: 'INVALID_QUERY' })
		await expect(
			// @ts-expect-error: a decimal is filtered by strings.
			Invoice.findMany({ where: { total: { lt: 2 } } }, M),
		).rejects.toMatchObject({ code: 'INVALID_QUERY' })
	})

	it('is typed as a string, its average as a number', async () => {
		await Invoice.createMany(
			{ data: [{ total: '1.25', count: 1 }, { total: '2' }] },
			M,
		)
		const found = await Invoice.findFirst({}, M)
		expectTypeOf(found?.total).toEqualTypeOf<string | undefined>()
		const result = await Invoice.aggregate(
			{
				_sum: { total: true, count: true },
				_avg: { total: true },
				_min: { rate: true },
			},
			M,
		)
		const { _sum: sum, _avg: avg, _min: min } = result
		expectTypeOf(sum.total).toEqualTypeOf<string | null>()
		expectTypeOf(sum.count).toEqualTypeOf<number | null>()
		expectTypeOf(avg.total).toEqualTypeOf<number | null>()
		expectTypeOf(min.rate).toEqualTypeOf<string | null>()
		expect({ sum, avg, min }).toEqual({
			sum: { total: '3.25', count: 1 },
			avg: { total: 1.625 },
			min: { rate: null },
		})
	})
})

describe('a field type stored as a decimal', () => {
	it('gives the adapter its precision and scale', () => {
		const cents = defineFieldType({
			plugin: 'money',
			stored: (f: FieldBuilders<never>) =>
				f.decimal({ precision: 12, scale: 2 }),
			decode: (stored: string) => stored,
			encode: (value: string) => value,
			schema: z.string(),
			toJSON: (value: string) => value,
		})
		interface Money extends PluginTypes {
			readonly name: 'money'
		}
		const money = definePlugin<Money>({ name: 'money', manifest })
		const Wallet = defineModel({
			name: 'Wallet',
			fields: () => ({ balance: cents() }),
		})
		const options = {
			database: memory(),
			models: [Wallet],
			plugins: [money.plugin()],
		}
		const [wallet] = schemaOf(options).models
		expect(wallet?.fields).toMatchObject([
			{ name: 'balance', type: 'decimal', precision: 12, scale: 2 },
		])
	})
})
