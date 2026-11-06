// The shop's operations: one refuses with an error of its own, the other
// fails with an error the client never sees.
//#region public
import { PublicError, allow, defineFunction, master } from 'ultimabase'
import { z } from 'zod'
import { Product } from './models.ts'

export const order = defineFunction({
	name: 'order',
	input: z.object({ sku: z.string(), quantity: z.int().min(1) }),
	run: async ({ input: { sku, quantity } }) => {
		const product = await Product.findUniqueOrThrow(
			{ where: { sku } },
			{ as: master },
		)
		if (product.stock < quantity) {
			throw new PublicError('OUT_OF_STOCK', `Only ${product.stock} left.`, {
				details: { sku: product.sku, left: product.stock },
			})
		}
		await Product.update(
			{ where: { id: product.id }, data: { stock: { decrement: quantity } } },
			{ as: master },
		)
	},
}).with({ access: allow.public })
//#endregion

//#region internal
export const subscribe = defineFunction({
	name: 'subscribe',
	input: z.object({ email: z.email() }),
	run: async ({ input }) => {
		const url = process.env['NEWSLETTER_URL']
		// Any other error is masked: the client sees `INTERNAL`.
		if (url === undefined) throw new Error('NEWSLETTER_URL is not set.')
		await fetch(url, { method: 'POST', body: JSON.stringify(input) })
	},
}).with({ access: allow.public })
//#endregion
