// A payer's sync (D-371 point 4): under its customer's lock, what Stripe
// holds now is written to the application's subscription and purchase rows,
// so events out of order or lost leave nothing stale.
import type {
	CustomerState,
	StripePayment,
	StripeSubscription,
} from './billing-gateway.ts'
import { settleCredits } from './credits.ts'
import type { Customer } from './customer.ts'
import { locked } from './customer.ts'
import { M, StripeCustomer } from './models.ts'
import type { Billing, Running } from './running.ts'
import { runningOf, stripeOf } from './running.ts'

/** Stripe's statuses of a subscription that still gives access. */
export const liveStatuses: readonly string[] = [
	'active',
	'trialing',
	'past_due',
	'unpaid',
	'paused',
]

/** The model when its payer is the customer's, else nothing to write. */
const ownModel = (model: Billing | undefined, row: Customer) =>
	model?.payer.name === row.model ? model : undefined

const connect = (id: string) => ({ connect: { id } })

async function writeSubscription(
	model: Billing,
	row: Customer,
	one: StripeSubscription,
): Promise<void> {
	if (one.product === null || one.price === null) return
	const values = {
		product: one.product,
		price: one.price,
		status: one.status,
		quantity: one.quantity,
		currentPeriodEnd: one.currentPeriodEnd,
		cancelAt: one.cancelAt,
		canceledAt: one.canceledAt,
		trialEnd: one.trialEnd,
		startedAt: one.startedAt,
		scheduledProduct: one.scheduled?.product ?? null,
		scheduledPrice: one.scheduled?.price ?? null,
		scheduledAt: one.scheduled?.at ?? null,
	}
	const where = { stripeId: one.id }
	const create = { ...values, stripeId: one.id, payer: connect(row.payer) }
	await model.queries.upsert({ where, create, update: values }, M)
}

async function writePayment(
	running: Running,
	row: Customer,
	payment: StripePayment,
): Promise<void> {
	const product =
		payment.product === null ? undefined : running.products.get(payment.product)
	if (product === undefined) return
	const purchase = ownModel(running.purchase, row)
	if (purchase !== undefined) {
		const refunded = payment.disputeLost ? payment.amount : payment.refunded
		const values = {
			amount: payment.amount,
			refunded,
			status: refunded >= payment.amount ? 'refunded' : 'paid',
		}
		await purchase.queries.upsert(
			{
				where: { stripeId: payment.id },
				create: {
					...values,
					stripeId: payment.id,
					product: product.key,
					paidAt: payment.paidAt,
					payer: connect(row.payer),
				},
				update: values,
			},
			M,
		)
	}
	if (!('prices' in product) && ownModel(running.balance, row) !== undefined) {
		await settleCredits(row.payer, payment, product)
	}
}

/** The next time one of the live subscriptions changes by itself. */
function renewsAt(state: CustomerState): Date | null {
	const times = state.subscriptions
		.filter(({ status }) => liveStatuses.includes(status))
		.flatMap((one) => [
			one.currentPeriodEnd,
			one.cancelAt,
			one.trialEnd,
			one.scheduled?.at ?? null,
		])
		.filter((time) => time !== null)
		.map((time) => time.getTime())
	return times.length === 0 ? null : new Date(Math.min(...times))
}

/** Ends the live rows of a customer Stripe deleted, and forgets it. */
async function forget(running: Running, row: Customer): Promise<void> {
	const subscription = ownModel(running.subscription, row)
	if (subscription !== undefined) {
		const where = {
			payer: { is: { id: row.payer } },
			status: { in: liveStatuses },
		}
		const data = { status: 'canceled', canceledAt: new Date() }
		await subscription.queries.updateManyAndReturn({ where, data }, M)
	}
	await StripeCustomer.delete({ where: { id: row.id } }, M)
}

/** Writes what Stripe holds of the customer of row `id`. */
export async function syncCustomer(id: string): Promise<void> {
	const running = runningOf('stripe.sync')
	const { gateway } = stripeOf('stripe.sync')
	await locked(id, async (row) => {
		if (row.stripeId === null) return
		const state = await gateway.readCustomer(row.stripeId)
		if (state.deleted) {
			await forget(running, row)
			return
		}
		const subscription = ownModel(running.subscription, row)
		if (subscription !== undefined) {
			for (const one of state.subscriptions) {
				await writeSubscription(subscription, row, one)
			}
		}
		for (const payment of state.payments) {
			await writePayment(running, row, payment)
		}
		const data = { syncedAt: new Date(), renewsAt: renewsAt(state) }
		await StripeCustomer.update({ where: { id: row.id }, data }, M)
	})
}
