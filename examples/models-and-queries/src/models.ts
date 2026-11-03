// The catalog's model: one field of each type, an index, virtual fields and
// a command.
//#region model
import { randomUUID } from 'node:crypto'
import { graphql } from '@ultimabase/graphql'
import { allow, defineModel, master, PublicError } from 'ultimabase'
import { z } from 'zod'
import { Price, Status } from './types.ts'

interface ProductCommands {
	/** Adds `count` items to a product's stock: the new stock. */
	restock(id: string, count: number): Promise<number>
}

export const Product = defineModel({
	name: 'Product',
	description: 'A product of the catalog.',
	use: [graphql()],
	fields: (f) => ({
		// Required unless `optional: true`; `search: true` makes it searchable.
		name: f.string({
			search: true,
			// A function returns the value to store or throws to refuse it; a
			// PublicError's code reaches the client with its message.
			validate: (name) => {
				if (name.trim() === '') {
					throw new PublicError('NAME_BLANK', 'A product needs a name.')
				}
				return name
			},
		}),
		sku: f.string({
			unique: true,
			validate: z.string().regex(/^[A-Z]{3}-\d{3}$/u),
			description: 'Three capitals, a dash and three digits.',
		}),
		summary: f.string({ optional: true }),
		// Exact: read and written as a string at its scale, '12.50'.
		price: f.decimal({ precision: 10, scale: 2 }),
		// Read by the server only.
		cost: f
			.decimal({ precision: 10, scale: 2, optional: true })
			.with({ access: { read: allow.private } }),
		// A function computes the default when the write leaves it out.
		reference: f.string({ unique: true, default: () => randomUUID() }),
		stock: f.number({ integer: true, default: 0 }),
		weight: f.number({ optional: true }),
		available: f.boolean({ default: true }),
		// A calendar day, '2026-07-31'; a dateTime is a Date.
		releasedOn: f.date({ optional: true }),
		restockedAt: f.dateTime({ optional: true }),
		status: f.enumOf(Status, { default: 'draft' }),
		// Lists are [] when empty.
		sizes: f.enumOf(['S', 'M', 'L'], { list: true }),
		keywords: f.string({ list: true }),
		// A schema types the JSON and validates it.
		specs: f.json({
			optional: true,
			validate: z.object({
				color: z.string(),
				materials: z.array(z.string()),
				// Added later: optional, as the rows stored before lack it.
				finish: z.string().optional(),
			}),
		}),
		// The column keeps the name an older table gave it; clients see the
		// field is deprecated.
		legacyCode: f.string({
			optional: true,
			dbName: 'old_code',
			deprecated: 'Use sku.',
		}),
		// Computed on read, from the fields `needs` lists.
		label: f.virtual(z.string(), { needs: ['name', 'sku'] }),
		priceIn: f.virtual(() => Price, {
			input: z.object({ currency: z.enum(['EUR', 'USD']) }),
			needs: ['price'],
		}),
	}),
	// Lists the products of a status by release day, fast.
	indexes: [
		{ fields: ['status', 'releasedOn'] },
		// The newest products first; `id` breaks ties between equal dates.
		{ fields: ['createdAt', 'id'] },
		// One product of a name per release day, whatever its case.
		{ fields: ['name', 'releasedOn'], unique: true, mode: 'insensitive' },
	],
})
	// Server code only: no transport serves a command.
	.commands<ProductCommands>(({ queries }) => ({
		restock: async (id, count) => {
			const { stock } = await queries.update(
				{
					where: { id },
					data: { stock: { increment: count }, restockedAt: new Date() },
				},
				{ as: master },
			)
			return stock
		},
	}))
	.with({
		access: allow.public,
		virtuals: {
			label: { run: ({ record }) => `${record.name} (${record.sku})` },
			priceIn: {
				run: ({ record, input }) => ({
					amount:
						input.currency === 'EUR'
							? record.price
							: (Number(record.price) * 1.1).toFixed(2),
					currency: input.currency,
				}),
			},
		},
	})
//#endregion
