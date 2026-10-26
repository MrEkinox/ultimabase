// The models: products in stock, and the orders that take from it.
import { graphql } from '@ultimabase/graphql'
import { PublicError, allow, defineModel, master } from 'ultimabase'

export const Product = defineModel({
	name: 'Product',
	use: [graphql()],
	fields: (f) => ({
		name: f.string(),
		stock: f.number(),
		orders: f.many(() => Order),
	}),
	// Clients read the products; only the server changes them.
}).with({ access: allow.readOnly })

export const Order = defineModel({
	name: 'Order',
	use: [graphql()],
	fields: (f) => ({
		product: f.one(() => Product),
		quantity: f.number(),
	}),
}).with({
	// Clients read the orders, and place them through `placeOrder`.
	access: allow.readOnly,
	hooks: {
		// Runs inside the order's transaction: throwing undoes the order.
		afterCreate: async ({ record }) => {
			const where = { id: record.product.id }
			const product = await Product.findUnique({ where }, { as: master })
			const stock = (product?.stock ?? 0) - record.quantity
			if (stock < 0) {
				throw new PublicError(
					'OUT_OF_STOCK',
					`${product?.name} is out of stock.`,
				)
			}
			await Product.update({ where, data: { stock } }, { as: master })
		},
	},
})
