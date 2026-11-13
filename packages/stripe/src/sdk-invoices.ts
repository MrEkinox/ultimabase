// A subscription's paid invoices, as their credits read them (D-377 point
// 4): the lines that bill a whole period above zero, and what was refunded
// or lost to a dispute of the payments that paid them.
import type { Stripe } from 'stripe'
import type {
	PriceKeys,
	StripeInvoice,
	StripePayment,
} from './billing-gateway.ts'
import { all, dateOf, keysOf, refOf } from './sdk-common.ts'

type Period = StripeInvoice['periods'][number]
type Keys = (price: string | Stripe.Price) => Promise<PriceKeys>

/** A price's keys, each price read once. */
function priceKeys(client: Stripe): Keys {
	const read = new Map<string, Promise<PriceKeys>>()
	return async (price) => {
		if (typeof price !== 'string') return keysOf(price)
		const held = read.get(price) ?? client.prices.retrieve(price).then(keysOf)
		read.set(price, held)
		return held
	}
}

/** Whether a line bills a whole period above zero: no proration, no trial. */
const billsPeriod = (line: Stripe.InvoiceLineItem): boolean =>
	line.amount > 0 && line.parent?.subscription_item_details?.proration === false

async function periodsOf(
	client: Stripe,
	invoice: Stripe.Invoice,
	keys: Keys,
): Promise<Period[]> {
	const lines =
		invoice.lines.has_more && invoice.id !== undefined
			? await all(client.invoices.listLineItems(invoice.id, { limit: 100 }))
			: invoice.lines.data
	return Promise.all(
		lines.filter(billsPeriod).flatMap((line) => {
			const price = line.pricing?.price_details?.price
			if (price === undefined) return []
			const quantity = line.quantity ?? 1
			const end = dateOf(line.period.end)
			return [keys(price).then((held) => ({ ...held, quantity, end }))]
		}),
	)
}

/**
 * The paid invoices, with the periods they bill and the refunds and
 * disputes of the payments that paid them, from the customer's `payments`
 * by id. An invoice whose periods ended is kept: its refund takes back what
 * it gave.
 */
export async function invoicesOf(
	client: Stripe,
	invoices: readonly Stripe.Invoice[],
	payments: ReadonlyMap<string, StripePayment>,
): Promise<StripeInvoice[]> {
	const keys = priceKeys(client)
	return Promise.all(
		invoices.map(async (invoice) => {
			const paidBy = (invoice.payments?.data ?? [])
				.filter(({ status }) => status === 'paid')
				.flatMap(({ payment }) => {
					const intent = refOf(payment.payment_intent ?? null)
					const held = intent === null ? undefined : payments.get(intent)
					return held === undefined ? [] : [held]
				})
			return {
				id: invoice.id ?? '',
				customerId: refOf(invoice.customer) ?? '',
				periods: await periodsOf(client, invoice, keys),
				amount: invoice.amount_paid,
				refunded: paidBy.reduce((sum, one) => sum + one.refunded, 0),
				disputeLost: paidBy.some(({ disputeLost }) => disputeLost),
			}
		}),
	)
}
