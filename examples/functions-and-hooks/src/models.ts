// The models: products in stock, and the orders that take from it.
//#region models
import { graphql } from '@ultimabase/graphql'
import { PublicError, allow, defineModel, master } from 'ultimabase'

export const Product = defineModel({
	name: 'Product',
	use: [graphql()],
	fields: (f) => ({
		name: f.string(),
		stock: f.number({ integer: true, default: 0 }),
		orders: f.many(() => Order),
	}),
}).with({
	// Clients read the products; only the server changes them.
	access: allow.readOnly,
	hooks: {
		// Sees the stock as the update leaves it, on the locked row.
		beforeUpdate: ({ record, data }) => {
			if (data.stock !== undefined && data.stock < 0) {
				throw new PublicError('OUT_OF_STOCK', `${record.name} is out of stock.`)
			}
		},
	},
})

export const Order = defineModel({
	name: 'Order',
	use: [graphql()],
	fields: (f) => ({
		product: f.one(() => Product),
		quantity: f.number({ integer: true }),
	}),
}).with({
	// Clients read the orders, and place them through `placeOrder`.
	access: allow.readOnly,
	hooks: {
		// Runs inside the order's transaction: throwing undoes the order.
		afterCreate: async ({ record }) => {
			await Product.update(
				{
					where: { id: record.product.id },
					data: { stock: { decrement: record.quantity } },
				},
				{ as: master },
			)
		},
	},
})
//#endregion
