// The function a client calls to place an order of several lines.
//#region place-order
import { allow, defineFunction, master, transaction } from 'ultimabase'
import { z } from 'zod'
import { Order } from './models.ts'

// Named, so GraphQL calls its input type `LineInput`.
const Line = z
	.object({ product: z.string(), quantity: z.int().min(1) })
	.meta({ id: 'Line' })

export const placeOrder = defineFunction({
	name: 'placeOrder',
	input: z.object({ lines: z.array(Line).min(1) }),
	output: [Order],
	// One transaction: every line is ordered, or none is.
	run: ({ input }) =>
		transaction(async () => {
			const orders = []
			for (const { product, quantity } of input.lines) {
				const data = { product: { connect: { id: product } }, quantity }
				// One after the other: each line takes from the stock the last left.
				orders.push(await Order.create({ data }, { as: master }))
			}
			return orders
		}),
}).with({ access: allow.public })
//#endregion
