// Writes and reads each field type from server code, as Master, each test on
// a new in-memory database.
import { testApplication } from '@ultimabase/testing'
import { master } from 'ultimabase'
import { expect, it } from 'vitest'
import { app } from './app.ts'
import { Product } from './models.ts'

testApplication(app)

it('writes and reads each field type', async () => {
	//#region create
	const lamp = await Product.create(
		{
			data: {
				name: 'Desk lamp',
				sku: 'LMP-001',
				price: '39.9',
				releasedOn: '2026-03-01',
				restockedAt: new Date('2026-10-01T08:00:00Z'),
				sizes: ['S', 'M'],
				keywords: ['light', 'office'],
				specs: { color: 'black', materials: ['steel'] },
			},
		},
		{ as: master },
	)
	expect(lamp).toMatchObject({
		name: 'Desk lamp',
		summary: null,
		price: '39.90',
		stock: 0,
		available: true,
		releasedOn: '2026-03-01',
		restockedAt: new Date('2026-10-01T08:00:00Z'),
		status: 'draft',
		sizes: ['S', 'M'],
		keywords: ['light', 'office'],
		specs: { color: 'black', materials: ['steel'] },
		label: 'Desk lamp (LMP-001)',
	})
	// Every row has an id, a createdAt and an updatedAt.
	expect(typeof lamp.id).toBe('string')
	expect(lamp.createdAt).toBeInstanceOf(Date)
	//#endregion
	//#region update-list
	const updated = await Product.update(
		{
			where: { sku: 'LMP-001' },
			data: { stock: { increment: 5 }, keywords: { push: 'desk' } },
		},
		{ as: master },
	)
	expect(updated.stock).toBe(5)
	expect(updated.keywords).toEqual(['light', 'office', 'desk'])
	//#endregion
})

it('reads a virtual field with its input', async () => {
	await Product.create(
		{ data: { name: 'Mug', sku: 'MUG-001', price: '12.00' } },
		{ as: master },
	)
	//#region virtual
	const mug = await Product.findUniqueOrThrow(
		{
			where: { sku: 'MUG-001' },
			select: { label: true, priceIn: { currency: 'USD' } },
		},
		{ as: master },
	)
	expect(mug).toEqual({
		label: 'Mug (MUG-001)',
		priceIn: { amount: '13.20', currency: 'USD' },
	})
	//#endregion
})

it('refuses a value its field does not accept', async () => {
	//#region refused
	await expect(
		Product.create(
			{ data: { name: 'Lamp', sku: 'lamp', price: '10.00' } },
			{ as: master },
		),
	).rejects.toMatchObject({
		code: 'VALIDATION_FAILED',
		message: 'Invalid data.',
		details: {
			issues: [
				{
					path: ['sku'],
					message: 'Invalid string: must match pattern /^[A-Z]{3}-\\d{3}$/u',
				},
			],
		},
	})
	await expect(
		Product.create(
			{ data: { name: ' ', sku: 'LMP-001', price: '10.00' } },
			{ as: master },
		),
	).rejects.toMatchObject({
		details: {
			issues: [
				{
					path: ['name'],
					code: 'NAME_BLANK',
					message: 'A product needs a name.',
				},
			],
		},
	})
	await expect(
		Product.create(
			{ data: { name: 'Lamp', sku: 'LMP-002', price: '1.005' } },
			{ as: master },
		),
	).rejects.toMatchObject({
		details: {
			issues: [
				{
					path: ['price'],
					message:
						"Expected a decimal string of at most 10 digits, 2 after the point, such as '12.50'.",
				},
			],
		},
	})
	await Product.create(
		{ data: { name: 'Lamp', sku: 'LMP-003', price: '10.00' } },
		{ as: master },
	)
	await expect(
		Product.create(
			{ data: { name: 'Lamp', sku: 'LMP-003', price: '12.00' } },
			{ as: master },
		),
	).rejects.toMatchObject({
		code: 'UNIQUE_VIOLATION',
		message: 'Unique constraint failed on Product (sku).',
		details: { model: 'Product', fields: ['sku'] },
	})
	const desk = { sku: 'DSK-001', price: '90.00', releasedOn: '2026-07-31' }
	await Product.create({ data: { ...desk, name: 'Desk' } }, { as: master })
	await expect(
		Product.create(
			{ data: { ...desk, name: 'DESK', sku: 'DSK-002' } },
			{ as: master },
		),
	).rejects.toMatchObject({
		code: 'UNIQUE_VIOLATION',
		details: { model: 'Product', fields: ['name', 'releasedOn'] },
	})
	//#endregion
})
