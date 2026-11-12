// A payment provider's webhook: a signed body, each event taken once, and
// the receipt sent in a job.
import { createHmac, timingSafeEqual } from 'node:crypto'
import { routes, validate } from '@ultimabase/http'
import { defineJob } from '@ultimabase/jobs'
import { HTTPException } from 'hono/http-exception'
import { allow, defineModel, master, transaction } from 'ultimabase'
import { z } from 'zod'
import { sendEmail } from './mail.ts'
import { Order } from './models.ts'

//#region event
// The events taken: the provider may send one twice, its id is unique.
export const PaymentEvent = defineModel({
	name: 'PaymentEvent',
	fields: (f) => ({ event: f.string({ unique: true }) }),
}).with({ access: allow.private })
//#endregion

//#region job
export const sendReceipt = defineJob({
	name: 'sendReceipt',
	input: z.object({ order: z.string() }),
	run: async ({ input }) => {
		const where = { id: input.order }
		const order = await Order.findUniqueOrThrow({ where }, { as: master })
		sendEmail(`Order ${order.id} is paid: ${order.total} EUR.`)
	},
})
//#endregion

//#region signed
// The provider's secret, from the environment in production.
const secret = process.env['PAYMENT_SECRET'] ?? 'dev-secret'

export const payments = routes()

// The signature covers the bytes received: it is checked before the body is
// parsed. Each provider has its own header and format; this one sends an
// HMAC-SHA256 of the body, in hex.
payments.use('/webhooks/payment', async (c, next) => {
	const body = await c.req.text()
	const expected = createHmac('sha256', secret).update(body).digest()
	const given = Buffer.from(c.req.header('x-signature') ?? '', 'hex')
	// Takes the same time whichever byte differs.
	if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
		throw new HTTPException(401, { message: 'Wrong signature.' })
	}
	await next()
})
//#endregion

//#region webhook
const paid = z.object({
	event: z.string(),
	order: z.string(),
	amount: z.int().positive(),
})

// The provider sends no session: the route writes as Master.
payments.post('/webhooks/payment', validate('json', paid), async (c) => {
	const { event, order, amount } = c.req.valid('json')
	const where = { event }
	await transaction(async () => {
		// An event sent again finds its row: it changes nothing. Sent twice at
		// once, the second create breaks the unique id and fails, so the
		// provider sends it again.
		if (await PaymentEvent.findUnique({ where }, { as: master })) return
		await PaymentEvent.create({ data: { event } }, { as: master })
		await Order.update(
			{ where: { id: order }, data: { paid: true } },
			{ as: master },
		)
		// Enqueued in the transaction: the receipt is sent once, if it commits.
		await sendReceipt.enqueue({ order })
	})
	return c.json({ order, amount, paid: true })
})
//#endregion
