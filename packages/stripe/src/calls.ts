// `stripe.checkout`, `stripe.portal` and `stripe.syncCheckout` (D-371 point
// 3, D-373 points 7 and 8): the server calls an application's functions make.
// Each runs under the payer's customer lock and expires the Checkouts the
// payer left open, so two tabs cannot both pay.
import { PublicError, Refused } from 'ultimabase'
import type { Gateway } from './accounts.ts'
import type { PortalFlow } from './billing-gateway.ts'
import { liveStatuses, Missing } from './billing-gateway.ts'
import type { Customer } from './customer.ts'
import {
	customerRow,
	ensureCustomer,
	locked,
	payerRow,
	renewed,
} from './customer.ts'
import { M, StripeCustomer } from './models.ts'
import type { Product, SubscriptionProduct } from './product.ts'
import type { Billing, Row, Running } from './running.ts'
import { runningOf, stripeOf } from './running.ts'
import { spend } from './credits.ts'
import { syncCustomer } from './sync.ts'

type Payer = { readonly id: string }
/** A product's price names: `'monthly' | 'yearly'`. */
type PriceOf<P> = P extends SubscriptionProduct<string, infer N> ? N : never

/** What `stripe.checkout` takes (D-373 point 7). */
export interface CheckoutArgs<P extends Product = Product> {
	/** The payer's row, as `{ id }`. */
	readonly payer: Payer
	readonly product: P
	/** One of a subscription product's prices; its only one by default. */
	readonly price?: PriceOf<P>
	/** 1 by default. */
	readonly quantity?: number
	readonly trialDays?: number
	/** Whether the payer must accept the portal's `termsUrl`. */
	readonly terms?: boolean
	readonly promotionCodes?: boolean
	/** Where Stripe sends the payer back; `{CHECKOUT_SESSION_ID}` is replaced. */
	readonly successUrl: string
	readonly cancelUrl: string
	readonly metadata?: Readonly<Record<string, string>>
}

/** What `stripe.portal` takes (D-373 point 8). */
export interface PortalArgs<
	P extends SubscriptionProduct = SubscriptionProduct,
> {
	readonly payer: Payer
	/** The portal option's `returnUrl` by default. */
	readonly returnUrl?: string
	/** Opens the confirmation of a move to another product or price. */
	readonly change?: {
		readonly product: P
		readonly price: PriceOf<P>
		/** The subscription row's id, when the payer has several live ones. */
		readonly subscription?: string
	}
	/** Opens the confirmation of a cancellation. */
	readonly cancel?: { readonly subscription?: string }
}

/** The catalog's product, or a bug: a product the plugin was not given. */
function catalogued(running: Running, product: Product): Product {
	if (running.products.get(product.key) === product) return product
	throw new Error(`${product.key} is not in stripePlugin's products.`)
}

/** The price's lookup key (D-372 point 3). */
function lookupKey(product: Product, price: string | undefined): string {
	if (!('prices' in product)) return product.key
	const names = Object.keys(product.prices)
	const [only] = names
	const name = price ?? (names.length === 1 ? only : undefined)
	if (name === undefined || !names.includes(name)) {
		throw new TypeError(`${product.key}'s price is one of ${names.join(', ')}.`)
	}
	return `${product.key}.${name}`
}

/** The model naming the payers of a product: who the customer is for. */
function billingOf(running: Running, product: Product): Billing {
	const billing =
		'prices' in product
			? running.subscription
			: (running.purchase ?? running.balance)
	if (billing !== undefined) return billing
	throw new Error(
		`${product.key} needs a model definePurchase returned, to record its payments.`,
	)
}

/**
 * Runs `run` with the payer's customer at Stripe, under its lock, after
 * expiring its open Checkouts; a customer deleted at Stripe is created again.
 */
async function withCustomer<R>(
	billing: Billing,
	payer: Payer,
	run: (gateway: Gateway, customerId: string, row: Customer) => Promise<R>,
): Promise<R> {
	const { gateway } = stripeOf('stripe')
	const read = await payerRow(billing.payer, payer.id)
	const held = await customerRow(billing.payer.name, payer.id)
	const done = await locked(held.id, async (row) => {
		const attempt = async (current: Customer): Promise<R> => {
			const { row: saved, stripeId } = await ensureCustomer(current, read)
			try {
				await gateway.expireCheckouts(stripeId)
				return await run(gateway, stripeId, saved)
			} catch (error) {
				if (!(error instanceof Missing) || current !== row) throw error
				return attempt(await renewed(saved))
			}
		}
		return { value: await attempt(row) }
	})
	if (done === undefined) throw new Error('The payer’s customer was closed.')
	return done.value
}

const checkPositive = (name: string, value: number | undefined): void => {
	if (value !== undefined && (!Number.isSafeInteger(value) || value < 1)) {
		throw new TypeError(`stripe.checkout: ${name} is a positive integer.`)
	}
}

/** Opens a Checkout for the payer and returns its URL. */
export async function checkout<const P extends Product>(
	args: CheckoutArgs<P>,
): Promise<string> {
	const running = runningOf('stripe.checkout')
	stripeOf('stripe.checkout')
	const product = catalogued(running, args.product)
	const key = lookupKey(product, args.price)
	checkPositive('quantity', args.quantity)
	checkPositive('trialDays', args.trialDays)
	const subscribing = 'prices' in product
	return withCustomer(
		billingOf(running, product),
		args.payer,
		async (gateway, customerId) => {
			if (subscribing && running.oneSubscription) {
				const { subscriptions } = await gateway.readCustomer(customerId)
				if (subscriptions.some(({ status }) => liveStatuses.includes(status))) {
					throw new PublicError(
						'ALREADY_SUBSCRIBED',
						'The payer already has a subscription.',
					)
				}
			}
			return gateway.openCheckout({
				customerId,
				reference: args.payer.id,
				mode: subscribing ? 'subscription' : 'payment',
				product: product.key,
				lookupKey: key,
				quantity: args.quantity ?? 1,
				trialDays: subscribing ? (args.trialDays ?? null) : null,
				terms: args.terms ?? false,
				promotionCodes: args.promotionCodes ?? false,
				successUrl: args.successUrl,
				cancelUrl: args.cancelUrl,
				metadata: args.metadata ?? {},
			})
		},
	)
}

/**
 * The payer's subscription a deep link is about, or `NOT_SUBSCRIBED`; the
 * code names one with `option` when the payer has several.
 */
async function subscriptionOf(
	model: Billing,
	payer: Payer,
	id: string | undefined,
	option: string,
): Promise<Row> {
	const where = {
		payer: { is: { id: payer.id } },
		status: { in: liveStatuses },
		...(id === undefined ? {} : { id }),
	}
	const live = await model.queries.findMany({ where, take: 2 }, M)
	const [one, other] = live
	if (one === undefined) {
		throw new PublicError('NOT_SUBSCRIBED', 'The payer has no subscription.')
	}
	if (other !== undefined) {
		throw new Refused(
			`stripe.portal: the payer has several live subscriptions; name the one with ${option}, a ${model.name} row’s id.`,
		)
	}
	return one
}

/** The portal's flow for the arguments. */
async function flowOf(
	running: Running,
	model: Billing,
	args: PortalArgs,
): Promise<PortalFlow> {
	const { change, cancel } = args
	if (change !== undefined && cancel !== undefined) {
		throw new TypeError('stripe.portal takes change or cancel, not both.')
	}
	if (change !== undefined) {
		const product = catalogued(running, change.product)
		const lookup = lookupKey(product, change.price)
		const row = await subscriptionOf(
			model,
			args.payer,
			change.subscription,
			'change.subscription',
		)
		const subscriptionId = String(row['stripeId'])
		return { kind: 'change', subscriptionId, lookupKey: lookup }
	}
	if (cancel !== undefined) {
		const row = await subscriptionOf(
			model,
			args.payer,
			cancel.subscription,
			'cancel.subscription',
		)
		return { kind: 'cancel', subscriptionId: String(row['stripeId']) }
	}
	return { kind: 'home' }
}

/** Opens the payer's customer portal, or one change's confirmation. */
export async function portal<const P extends SubscriptionProduct>(
	args: PortalArgs<P>,
): Promise<string> {
	const running = runningOf('stripe.portal')
	const { gateway } = stripeOf('stripe.portal')
	const model = running.subscription
	if (model === undefined) {
		throw new Error('stripe.portal needs a model defineSubscription returned.')
	}
	const flow = await flowOf(running, model, args)
	running.portal ??= (await gateway.readCatalog()).portal?.id ?? null
	const configuration = running.portal
	const returnUrl = args.returnUrl ?? running.catalog.portal.returnUrl
	return withCustomer(model, args.payer, async (_, customerId) =>
		gateway.openPortal({ customerId, configuration, returnUrl, flow }),
	)
}

/**
 * Syncs the payer's Checkout `sessionId` when the client comes back, without
 * waiting for the webhook; `NOT_FOUND` for another payer's.
 */
export async function syncCheckout(
	sessionId: string,
	payer: Payer,
): Promise<void> {
	const { gateway } = stripeOf('stripe.syncCheckout')
	const customerId = await gateway.checkoutCustomer(sessionId)
	const row =
		customerId === null
			? null
			: await StripeCustomer.findUnique({ where: { stripeId: customerId } }, M)
	if (row === null || row.payer !== payer.id) {
		throw new PublicError('NOT_FOUND', 'No Checkout of the payer matches.')
	}
	await syncCustomer(row.id)
}

/** The running plugin, from the application's functions (D-371 point 3). */
export const stripe: {
	readonly checkout: typeof checkout
	readonly portal: typeof portal
	readonly syncCheckout: typeof syncCheckout
	readonly spend: typeof spend
} = { checkout, portal, syncCheckout, spend }
