// The shop's operations: one refuses with an error of its own, the other
// fails with an error the client never sees.
import { PublicError, allow, defineFunction, master } from 'ultimabase'
import { z } from 'zod'
import { Product } from './models.ts'

//#region public
export const order = defineFunction({
	name: 'order',
	input: z.object({ sku: z.string(), quantity: z.int().min(1) }),
	run: async ({ input }) => {
		const product = await Product.findUniqueOrThrow(
			{ where: { sku: input.sku } },
			{ as: master },
		)
		if (product.stock < input.quantity) {
			// The code, the message and the details reach the client.
			throw new PublicError('OUT_OF_STOCK', `Only ${product.stock} left.`, {
				details: { sku: product.sku, left: product.stock },
			})
		}
		await Product.update(
			{
				where: { id: product.id },
				data: { stock: { decrement: input.quantity } },
			},
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
