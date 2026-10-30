// Reads and writes the catalog from server code, as Master, each test on a
// new in-memory database holding four products.
//#region seed
import { testApplication } from '@ultimabase/testing'
import { master } from 'ultimabase'
import { beforeEach, expect, it } from 'vitest'
import { app } from './app.ts'
import { Product } from './models.ts'

testApplication(app)

const as = { as: master }
const names = (rows: readonly { readonly name: string }[]): string[] =>
	rows.map((row) => row.name)

beforeEach(async () => {
	// One write of every row, which returns { count: 4 }.
	await Product.createMany(
		{
			data: [
				{
					name: 'Desk lamp',
					sku: 'LMP-001',
					price: '39.90',
					stock: 5,
					status: 'published',
					keywords: ['light', 'office'],
					releasedOn: '2026-03-01',
				},
				{
					name: 'Floor lamp',
					sku: 'LMP-002',
					price: '89.00',
					status: 'published',
					keywords: ['light'],
					releasedOn: '2026-05-10',
				},
				{
					name: 'Mug',
					sku: 'MUG-001',
					price: '12.00',
					stock: 40,
					keywords: ['kitchen'],
				},
				{
					name: 'Teapot',
					sku: 'TEA-001',
					price: '24.50',
					stock: 12,
					status: 'archived',
					keywords: ['kitchen'],
				},
			],
		},
		as,
	)
})
//#endregion

it('filters with operators', async () => {
	//#region where
	const published = await Product.findMany(
		{ where: { status: 'published', price: { lt: '50.00' } } },
		as,
	)
	expect(names(published)).toEqual(['Desk lamp'])

	const filtered = await Product.findMany(
		{
			where: {
				name: { contains: 'LAMP', mode: 'insensitive' },
				releasedOn: { gte: '2026-04-01' },
			},
		},
		as,
	)
	expect(names(filtered)).toEqual(['Floor lamp'])

	// A list: has, hasSome, hasEvery, isEmpty.
	const kitchen = await Product.findMany(
		{ where: { keywords: { has: 'kitchen' }, stock: { gt: 20 } } },
		as,
	)
	expect(names(kitchen)).toEqual(['Mug'])

	// AND, OR and NOT combine filters; null matches a missing value.
	const either = await Product.findMany(
		{
			where: {
				OR: [{ stock: 0 }, { releasedOn: null }],
				NOT: { status: 'archived' },
			},
		},
		as,
	)
	expect(names(either)).toEqual(['Floor lamp', 'Mug'])
	//#endregion
})

it('sorts and pages', async () => {
	//#region order
	const cheapest = await Product.findMany(
		{ orderBy: { price: 'asc' }, skip: 1, take: 2 },
		as,
	)
	expect(names(cheapest)).toEqual(['Teapot', 'Desk lamp'])

	// An optional field's nulls sort last unless `nulls` says otherwise.
	const byRelease = await Product.findMany(
		{
			orderBy: [
				{ releasedOn: { sort: 'desc', nulls: 'last' } },
				{ name: 'asc' },
			],
		},
		as,
	)
	expect(names(byRelease)).toEqual(['Floor lamp', 'Desk lamp', 'Mug', 'Teapot'])
	//#endregion
	//#region cursor
	// The next page starts after the last row of this one.
	const first = await Product.findMany(
		{ orderBy: { name: 'asc' }, take: 2 },
		as,
	)
	const last = first.at(-1)
	if (last === undefined) throw new Error('The first page is empty.')
	const next = await Product.findMany(
		{
			orderBy: { name: 'asc' },
			cursor: { id: last.id },
			skip: 1,
			take: 2,
		},
		as,
	)
	expect(names(next)).toEqual(['Mug', 'Teapot'])
	//#endregion
})

it('finds one row', async () => {
	//#region unique
	const mug = await Product.findUnique({ where: { sku: 'MUG-001' } }, as)
	expect(mug?.price).toBe('12.00')
	// A unique index's fields together find a row too.
	const lamp = await Product.findUnique(
		{ where: { name: 'Desk lamp', releasedOn: '2026-03-01' } },
		as,
	)
	expect(lamp?.sku).toBe('LMP-001')
	expect(await Product.findFirst({ where: { stock: 99 } }, as)).toBeNull()
	await expect(
		Product.findUniqueOrThrow({ where: { sku: 'CUP-001' } }, as),
	).rejects.toMatchObject({ code: 'NOT_FOUND', message: 'No Product matches.' })
	//#endregion
})

it('returns the fields it is asked for', async () => {
	//#region select
	const rows = await Product.findMany(
		{ where: { status: 'published' }, select: { name: true, price: true } },
		as,
	)
	expect(rows).toEqual([
		{ name: 'Desk lamp', price: '39.90' },
		{ name: 'Floor lamp', price: '89.00' },
	])
	const mug = await Product.findUniqueOrThrow(
		{ where: { sku: 'MUG-001' }, omit: { specs: true, keywords: true } },
		as,
	)
	expect(mug).not.toHaveProperty('specs')
	//#endregion
})

it('searches the text fields', async () => {
	//#region search
	// Words, "quoted phrases", `or`, and -word to leave one out.
	const lamps = await Product.findMany(
		{
			where: { _search: 'lamp -floor' },
			orderBy: { _relevance: 'desc' },
		},
		as,
	)
	expect(names(lamps)).toEqual(['Desk lamp'])
	//#endregion
})

it('counts and aggregates', async () => {
	//#region aggregate
	expect(await Product.count({ where: { stock: { gt: 0 } } }, as)).toBe(3)

	const totals = await Product.aggregate(
		{
			_count: true,
			_sum: { stock: true, price: true },
			_min: { price: true },
			_max: { releasedOn: true },
		},
		as,
	)
	expect(totals).toEqual({
		_count: 4,
		// A decimal's sum is a decimal string.
		_sum: { stock: 57, price: '165.40' },
		_min: { price: '12.00' },
		_max: { releasedOn: '2026-05-10' },
	})
	//#endregion
	//#region group-by
	const byStatus = await Product.groupBy(
		{
			by: ['status'],
			_count: true,
			_sum: { stock: true },
			having: { stock: { _sum: { gt: 0 } } },
			orderBy: { status: 'asc' },
		},
		as,
	)
	expect(byStatus).toEqual([
		{ status: 'archived', _count: 1, _sum: { stock: 12 } },
		{ status: 'draft', _count: 1, _sum: { stock: 40 } },
		{ status: 'published', _count: 2, _sum: { stock: 5 } },
	])
	//#endregion
	//#region distinct
	// The first row of each status, in the read's order.
	const priciest = await Product.findMany(
		{
			distinct: ['status'],
			orderBy: { price: 'desc' },
			select: { status: true, name: true },
		},
		as,
	)
	expect(priciest).toEqual([
		{ status: 'published', name: 'Floor lamp' },
		{ status: 'archived', name: 'Teapot' },
		{ status: 'draft', name: 'Mug' },
	])
	//#endregion
})

it('writes many rows at once', async () => {
	//#region bulk
	const { count } = await Product.updateMany(
		{
			where: { keywords: { has: 'light' } },
			data: { stock: { increment: 10 } },
		},
		as,
	)
	expect(count).toBe(2)

	const archived = await Product.deleteMany(
		{ where: { status: 'archived' } },
		as,
	)
	expect(archived.count).toBe(1)

	// Updates the row the unique `where` finds, or creates it.
	const cup = await Product.upsert(
		{
			where: { sku: 'CUP-001' },
			create: { name: 'Cup', sku: 'CUP-001', price: '8.00' },
			update: { stock: { increment: 1 } },
		},
		as,
	)
	expect(cup.stock).toBe(0)
	//#endregion
})
