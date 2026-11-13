// A payer's sync (D-371 point 4, D-375): what Stripe holds now is written
// to the application's subscription and purchase rows, so events out of
// order or lost leave nothing stale. Stripe is read outside any transaction;
// the write takes the customer's lock.
import { transaction } from 'ultimabase'
import type {
	CustomerState,
	StripeInvoice,
	StripePayment,
	StripeSubscription,
} from './billing-gateway.ts'
import { liveStatuses } from './billing-gateway.ts'
import { lost, settleCredits, totals } from './credits.ts'
import type { Customer } from './customer.ts'
import { duplicateJob, duplicatesOf } from './duplicates.ts'
import { fits } from './enums.ts'
import { M, StripeCustomer } from './models.ts'
import type { Billing, Row, Running } from './running.ts'
import { runningOf, stripeOf } from './running.ts'

/** The model when its payer is the customer's, else nothing to write. */
const ownModel = (model: Billing | undefined, row: Customer) =>
	model?.payer.name === row.model ? model : undefined

const connect = (id: string) => ({ connect: { id } })

/** Whether the row holds each value already. */
const holds = (row: Row, values: Readonly<Record<string, unknown>>) =>
	Object.entries(values).every(([field, value]) => {
		const held = row[field]
		return value instanceof Date && held instanceof Date
			? value.getTime() === held.getTime()
			: held === value
	})

/**
 * Creates the row of `stripeId`, unless `create` is `null`, or updates it
 * when one of its values changed: a sync that finds it unchanged writes
 * nothing, so the model's hooks run on a change only. The customer's lock
 * is held.
 */
async function save(
	model: Billing,
	stripeId: string,
	create: object | null,
	values: Readonly<Record<string, unknown>>,
): Promise<void> {
	const row = await model.queries.findUnique({ where: { stripeId } }, M)
	if (row === null) {
		if (create === null) return
		const data = { ...create, ...values, stripeId }
		await model.queries.create({ data }, M)
	} else if (!holds(row, values)) {
		await model.queries.update({ where: { id: row.id }, data: values }, M)
	}
}

async function writeSubscription(
	running: Running,
	model: Billing,
	row: Customer,
	one: StripeSubscription,
): Promise<void> {
	const dates = {
		status: one.status,
		currentPeriodEnd: one.currentPeriodEnd,
		cancelAt: one.cancelAt,
		canceledAt: one.canceledAt,
		trialEnd: one.trialEnd,
		startedAt: one.startedAt,
	}
	const outside = one.product === null || one.price === null
	if (outside || !fits(model.enums, one)) {
		const { id: subscription, priceId: price, customerId: customer } = one
		running.logger.error(
			{ subscription, price, customer },
			outside
				? 'A Stripe subscription has a price outside the catalog: its payer gets nothing.'
				: `A Stripe subscription has a product or price ${model.name}'s enums miss: its payer gets nothing.`,
		)
		// Its row, if any, keeps its last product, and still ends (D-386,
		// D-387 point 4).
		await save(model, one.id, null, dates)
		return
	}
	const values = {
		...dates,
		product: one.product,
		price: one.price,
		quantity: one.quantity,
		amount: one.amount,
		every: one.every,
		everyCount: one.everyCount,
		scheduledProduct: one.scheduled?.product ?? null,
		scheduledPrice: one.scheduled?.price ?? null,
		scheduledAt: one.scheduled?.at ?? null,
	}
	await save(model, one.id, { payer: connect(row.payer) }, values)
}

async function writePayment(
	running: Running,
	row: Customer,
	payment: StripePayment,
): Promise<void> {
	// A payment without a product key is an invoice's: not the catalog's.
	if (payment.product === null) return
	const product = running.products.get(payment.product)
	if (product === undefined) {
		const { id, product: key, customerId: customer } = payment
		running.logger.error(
			{ payment: id, product: key, customer },
			'A Stripe payment has a product outside the catalog: its payer gets nothing.',
		)
		return
	}
	const purchase = ownModel(running.purchase, row)
	if (purchase !== undefined) {
		const refunded = payment.disputeLost ? payment.amount : payment.refunded
		const values = {
			amount: payment.amount,
			refunded,
			// A free purchase, after a full discount, is paid, not refunded.
			status: lost(payment) ? 'refunded' : 'paid',
			receiptUrl: payment.receiptUrl,
		}
		const create = {
			product: product.key,
			quantity: payment.quantity,
			paidAt: payment.paidAt,
			payer: connect(row.payer),
		}
		await save(purchase, payment.id, create, values)
	}
	if (!('prices' in product) && ownModel(running.balance, row) !== undefined) {
		const sums = totals(product.gives, payment.quantity)
		await settleCredits(row.payer, payment, sums, 'purchase')
	}
}

/**
 * Gives what the invoice's periods give, for the periods not ended yet: a
 * `gives` added later pays nothing for the past (D-377 point 4).
 */
async function writeInvoice(
	running: Running,
	row: Customer,
	invoice: StripeInvoice,
	readAt: Date,
): Promise<void> {
	const sums = new Map<string, number>()
	for (const { product: key, price, quantity, end } of invoice.periods) {
		const product = key === null ? undefined : running.products.get(key)
		if (end <= readAt || price === null || !product || !('prices' in product)) {
			continue
		}
		totals(product.prices[price]?.gives ?? [], quantity, sums)
	}
	if (sums.size === 0 && !lost(invoice)) return
	await settleCredits(row.payer, invoice, sums, 'subscription')
}

/** Whether a recurring price gives credits: then the sync reads invoices. */
const readsInvoices = ({ products, balance }: Running): boolean =>
	balance !== undefined &&
	[...products.values()].some(
		(product) =>
			'prices' in product &&
			Object.values(product.prices).some(({ gives }) => gives !== undefined),
	)

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

/** Writes what was read of the customer, under its lock. */
async function write(
	running: Running,
	row: Customer,
	state: CustomerState,
	readAt: Date,
) {
	if (state.deleted) {
		await forget(running, row)
		return
	}
	const subscription = ownModel(running.subscription, row)
	if (subscription !== undefined) {
		for (const one of state.subscriptions) {
			await writeSubscription(running, subscription, row, one)
		}
	}
	for (const payment of state.payments) {
		await writePayment(running, row, payment)
	}
	if (ownModel(running.balance, row) !== undefined) {
		for (const invoice of state.invoices) {
			await writeInvoice(running, row, invoice, readAt)
		}
	}
	// Enqueued with the write: a sync that writes nothing read older.
	if (running.oneSubscription) {
		for (const { id } of duplicatesOf(state.subscriptions)) {
			await duplicateJob.enqueue({ subscription: id })
		}
	}
}

/**
 * Writes what Stripe holds of the customer of row `id`. The sync takes the
 * next number of the customer's syncs, reads Stripe, then writes only when
 * no sync begun after it wrote first. A change at Stripe sends an event
 * whose sync begins after it, so no sync begun before overwrites it.
 */
export async function syncCustomer(id: string): Promise<void> {
	const running = runningOf('stripe.sync')
	const { gateway } = stripeOf('stripe.sync')
	const [begun] = await StripeCustomer.updateManyAndReturn(
		{ where: { id }, data: { syncsBegun: { increment: 1 } } },
		M,
	)
	const stripeId = begun?.stripeId ?? null
	if (begun === undefined || stripeId === null) return
	const readAt = new Date()
	const invoices = readsInvoices(running)
	// Only a catalog that sells once has Checkouts a discount made free.
	const free = [...running.products.values()].some((one) => !('prices' in one))
	const state = await gateway.readCustomer(stripeId, { invoices, free })
	await transaction(async () => {
		const number = begun.syncsBegun
		const data = {
			syncWritten: number,
			syncedAt: readAt,
			renewsAt: renewsAt(state),
		}
		// The customer's lock, taken by the write.
		const [row] = await StripeCustomer.updateManyAndReturn(
			{ where: { id, stripeId, syncWritten: { lt: number } }, data },
			M,
		)
		if (row !== undefined) await write(running, row, state, readAt)
	})
	// Outside the lock, as any call to Stripe (D-380).
	for (const one of state.subscriptions) {
		if (one.card !== null && liveStatuses.includes(one.status)) {
			await gateway.moveCard({ ...one, card: one.card })
		}
	}
}
