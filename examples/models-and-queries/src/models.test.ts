// Writes and reads each field type from server code, as Master, each test on
// a new in-memory database.
import { testApplication } from '@ultimabase/testing'
import { master } from 'ultimabase'
import { expect, it } from 'vitest'
import { app } from './app.ts'
import { Category } from './category.ts'
import { Product } from './models.ts'
import { Shift } from './schedule.ts'

testApplication(app)

it('gives a row an id and two dates', async () => {
	//#region row
	const books = await Category.create(
		{ data: { name: 'Books' } },
		{ as: master },
	)
	expect(books).toMatchObject({ name: 'Books', position: 0 })
	// The kernel writes the id (a UUID v7), createdAt and updatedAt.
	expect(books.id).toMatch(/^[\da-f]{8}-[\da-f]{4}-7/u)
	expect(books.createdAt).toBeInstanceOf(Date)
	expect(books.updatedAt).toBeInstanceOf(Date)
	//#endregion
})

it('normalizes what it reads back', async () => {
	//#region normalized
	const lamp = await Product.create(
		{ data: { name: 'Desk lamp', sku: 'LMP-001', price: '39.9' } },
		{ as: master },
	)
	// The decimal at its scale, an optional field `null`, a list `[]`.
	expect(lamp).toMatchObject({ price: '39.90', summary: null, sizes: [] })
	// A virtual field is returned without `select`.
	expect(lamp.label).toBe('Desk lamp (LMP-001)')
	// The defaults are filled.
	expect(lamp).toMatchObject({ stock: 0, available: true, status: 'draft' })
	//#endregion
})

it('writes and reads each field type', async () => {
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

it('reads a JSON value without a key its schema added later', async () => {
	//#region json-shape
	// Without `finish`, as the rows stored before it was added.
	const specs = { color: 'oak', materials: ['wood'] }
	const chair = await Product.create(
		{ data: { name: 'Chair', sku: 'CHR-001', price: '80.00', specs } },
		{ as: master },
	)
	// Its type is `string | undefined`: the code handles both.
	expect(chair.specs?.finish ?? 'raw').toBe('raw')
	//#endregion
	//#region json-shape-update
	const finished = await Product.update(
		{ where: { id: chair.id }, data: { specs: { ...specs, finish: 'matte' } } },
		{ as: master },
	)
	expect(finished.specs?.finish).toBe('matte')
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

it('runs a command on the model', async () => {
	//#region command
	const { id } = await Product.create(
		{ data: { name: 'Mug', sku: 'MUG-001', price: '12.00' } },
		{ as: master },
	)
	await expect(Product.restock(id, 12)).resolves.toBe(12)
	await expect(Product.restock(id, 3)).resolves.toBe(15)
	//#endregion
})

const plain = { name: 'Lamp', sku: 'LMP-001', price: '10.00' }

it('refuses a value its field does not accept', async () => {
	//#region refused-schema
	await expect(
		Product.create({ data: { ...plain, sku: 'lamp' } }, { as: master }),
	).rejects.toMatchObject({
		details: {
			issues: [
				{
					path: ['sku'],
					message: 'Invalid string: must match pattern /^[A-Z]{3}-\\d{3}$/u',
				},
			],
		},
	})
	//#endregion
	await expect(
		Product.create({ data: { ...plain, sku: 'lamp' } }, { as: master }),
	).rejects.toMatchObject({
		code: 'VALIDATION_FAILED',
		message: 'Invalid data.',
	})
	//#region refused-function
	await expect(
		Product.create({ data: { ...plain, name: ' ' } }, { as: master }),
	).rejects.toMatchObject({
		details: {
			issues: [{ path: ['name'], code: 'NAME_BLANK' }],
		},
	})
	//#endregion
	await expect(
		Product.create({ data: { ...plain, name: ' ' } }, { as: master }),
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
		Product.create({ data: { ...plain, price: '1.005' } }, { as: master }),
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
})

it('refuses a second row with a unique value', async () => {
	//#region refused-unique
	await Product.create({ data: plain }, { as: master })
	await expect(
		Product.create({ data: { ...plain, price: '12.00' } }, { as: master }),
	).rejects.toMatchObject({
		code: 'UNIQUE_VIOLATION',
		message: 'Unique constraint failed on Product (sku).',
		details: { model: 'Product', fields: ['sku'] },
	})
	//#endregion
})

it('refuses a clash of case on an insensitive index', async () => {
	//#region refused-index
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

it("validates a field with the app's preset", async () => {
	//#region preset
	const mug = await Product.create(
		{ data: { ...plain, summary: ' Blue. ' } },
		{ as: master },
	)
	expect(mug.summary).toBe('Blue.')
	//#endregion
	//#region preset-refused
	await expect(
		Product.create(
			{ data: { ...plain, sku: 'CUP-001', summary: '  ' } },
			{ as: master },
		),
	).rejects.toMatchObject({
		code: 'VALIDATION_FAILED',
		details: { issues: [{ path: ['summary'], message: 'Never blank.' }] },
	})
	//#endregion
})

it('refuses a list outside its size', async () => {
	//#region list-size-refused
	await expect(
		Shift.create({ data: { staff: [] } }, { as: master }),
	).rejects.toMatchObject({
		code: 'VALIDATION_FAILED',
		details: {
			issues: [{ path: ['staff'], message: 'Expected 1 to 5 values.' }],
		},
	})
	//#endregion
})
