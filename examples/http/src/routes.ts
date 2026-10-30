// The application's own routes, served beside the API.
//#region routes
import { routes, validate } from '@ultimabase/http'
import { HTTPException } from 'hono/http-exception'
import { master, PublicError } from 'ultimabase'
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

//#region webhook
// The provider's secret, from the environment in production.
const secret = process.env['PAYMENT_SECRET'] ?? 'dev-secret'

// The provider sends no session: the route checks its secret, then writes
// as Master.
shop.post(
	'/webhooks/payment',
	validate('header', z.object({ 'x-secret': z.string() })),
	validate('json', z.object({ order: z.string(), amount: z.int().positive() })),
	async (c) => {
		if (c.req.valid('header')['x-secret'] !== secret) {
			throw new HTTPException(401, { message: 'Wrong secret.' })
		}
		const { order, amount } = c.req.valid('json')
		const paid = await Order.update(
			{ where: { id: order }, data: { paid: true } },
			{ as: master },
		)
		return c.json({ order: paid.id, amount, paid: paid.paid })
	},
)
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
