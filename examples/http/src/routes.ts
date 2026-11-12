// The application's own routes, served beside the API.
//#region routes
import { routes, validate } from '@ultimabase/http'
import { PublicError } from 'ultimabase'
import { z } from 'zod'
import { Order } from './models.ts'

export const shop = routes()

// A route reads as its caller: the order's read rule applies.
shop.get('/orders/:id/receipt', async (c) => {
	const where = { id: c.req.param('id') }
	const order = await Order.findUnique({ where }, { as: c.var.caller })
	if (order === null) throw new PublicError('NOT_FOUND', 'No such order.')
	return c.text(
		`Order ${order.id}: ${order.total} EUR, ${order.paid ? 'paid' : 'due'}.`,
	)
})
//#endregion

//#region query
// `?min=` arrives as text: the schema turns it into a number.
shop.get(
	'/orders',
	validate('query', z.object({ min: z.coerce.number().int().default(0) })),
	async (c) => {
		const { min } = c.req.valid('query')
		const where = { total: { gte: min } }
		return c.json(await Order.count({ where }, { as: c.var.caller }))
	},
)
//#endregion

//#region whoami
// Who sends the request, and from where.
shop.get('/whoami', (c) =>
	c.json({ caller: c.var.caller.kind, address: c.var.address }),
)
//#endregion

//#region cache
// Every response is `Cache-Control: no-store`, unless its route sets one.
shop.get('/prices', (c) => {
	c.header('cache-control', 'public, max-age=60')
	return c.json({ shipping: 5 })
})
//#endregion
