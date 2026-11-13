// What the sandbox suite (`yarn test:stripe`, D-371 point 8) runs on: a
// Stripe sandbox's secret key, a catalog of its run's own, payers whose
// customers sit on test clocks, and the events Stripe lists, posted signed
// to the webhook as Stripe would. It never reads a live key, and never
// prints the key.
import { randomBytes } from 'node:crypto'
import { httpPlugin } from '@ultimabase/http'
import { jobsPlugin } from '@ultimabase/jobs'
import { runJobs } from '@ultimabase/testing'
import type { Stripe } from 'stripe'
import { defineApp, master, memory } from 'ultimabase'
import { stripeClient } from '../gateway.ts'
import { StripeCustomer } from '../models.ts'
import type { StripeOptions } from '../plugin.ts'
import { stripePlugin } from '../plugin.ts'
import { defineProduct } from '../product.ts'
import { postEvent, thinEvent } from '../testing.ts'
import {
	Balance,
	CreditHistory,
	gems,
	Purchase,
	Subscription,
	User,
} from './billing-app.ts'

/** The sandbox's secret key, or an error that says what to set. */
function sandboxKey(): string {
	const key = process.env['STRIPE_SECRET_KEY'] ?? ''
	if (key === '') {
		throw new Error(
			'yarn test:stripe needs STRIPE_SECRET_KEY, the secret key of a Stripe sandbox (sk_test_…).',
		)
	}
	if (!key.startsWith('sk_test_')) {
		throw new Error(
			'yarn test:stripe runs on a sandbox only: STRIPE_SECRET_KEY must be a test secret key, sk_test_….',
		)
	}
	return key
}

const secret = sandboxKey()
export const client: Stripe = stripeClient(secret)
const webhook = `whsec_${randomBytes(24).toString('base64')}`

/** This run's name, which prefixes everything it makes at Stripe. */
export const run = `ub_${Date.now().toString(36)}_${randomBytes(3).toString('hex')}`
/** When this run began, in Stripe's seconds. */
const began = Math.floor(Date.now() / 1000)

export const pro = defineProduct({
	key: `${run}_pro`,
	name: `Pro (${run})`,
	// A new account sells through Managed Payments, which needs a tax code.
	taxCode: 'txcd_10103000',
	prices: {
		monthly: { amount: 9_90, every: 'month', gives: [gems(100)] },
		yearly: { amount: 99_00, every: 'year' },
	},
})
export const gemPack = defineProduct({
	key: `${run}_gems`,
	name: `500 gems (${run})`,
	taxCode: 'txcd_10000000',
	price: { amount: 4_90 },
	gives: [gems(500)],
})
export const products = [pro, gemPack]
export const portal = { returnUrl: 'https://example.com/account' }

/** An application that sells this run's catalog on the sandbox. */
export const sandboxApp = (options: Partial<StripeOptions> = {}): object =>
	defineApp({
		database: memory(),
		models: [User, Subscription, Purchase, Balance, CreditHistory],
		plugins: [
			httpPlugin(),
			jobsPlugin({ jobs: [] }),
			stripePlugin({
				keys: { secret, webhook },
				currency: 'eur',
				products,
				portal,
				customer: (user: { readonly email: string }) => ({
					email: user.email,
				}),
				...options,
			}),
		],
	})

/** A price's id, by its lookup key. */
export async function priceId(lookupKey: string): Promise<string> {
	const { data } = await client.prices.list({
		lookup_keys: [lookupKey],
		active: true,
	})
	const [price] = data
	if (price === undefined) throw new Error(`No price is ${lookupKey}.`)
	return price.id
}

const clocks: string[] = []

/**
 * A payer whose customer sits on a test clock of its own, with a card that
 * pays: the plugin finds it as the customer it would have made.
 */
export async function payerAtStripe(): Promise<{
	readonly payer: { readonly id: string; readonly email: string }
	readonly customer: string
	readonly method: string
}> {
	const email = `${run}@example.com`
	const payer = await User.create({ data: { email } }, { as: master })
	const clock = await client.testHelpers.testClocks.create({
		frozen_time: Math.floor(Date.now() / 1000),
		name: run,
	})
	clocks.push(clock.id)
	const { id: customer } = await client.customers.create({
		email,
		test_clock: clock.id,
		metadata: { managedBy: 'ultimabase' },
	})
	const { id: method } = await client.paymentMethods.attach('pm_card_visa', {
		customer,
	})
	await client.customers.update(customer, {
		invoice_settings: { default_payment_method: method },
	})
	await StripeCustomer.create(
		{ data: { model: 'User', payer: payer.id, stripeId: customer } },
		{ as: master },
	)
	return { payer, customer, method }
}

const posted = new Set<string>()

/**
 * Posts the events Stripe listed since the run began, each once, as thin
 * events signed with the webhook's secret, then runs the jobs: what the
 * Stripe CLI would forward, with no CLI.
 */
export async function delivered(url: string): Promise<void> {
	const created = { gte: began }
	for await (const event of client.events.list({ created, limit: 100 })) {
		if (posted.has(event.id)) continue
		posted.add(event.id)
		const object: unknown = event.data.object
		const id: unknown = Reflect.get(Object(object), 'id')
		const type: unknown = Reflect.get(Object(object), 'object')
		if (typeof id !== 'string' || typeof type !== 'string') continue
		const payload = thinEvent({
			id: event.id,
			type: event.type,
			object: { id, type },
		})
		const response = await postEvent(url, payload, { secret: webhook })
		if (!response.ok) {
			throw new Error(`The webhook answered ${String(response.status)}.`)
		}
	}
	await runJobs()
}

/** Whether Stripe lists an event of `customer` yet. */
export async function listed(customer: string): Promise<boolean> {
	const created = { gte: began }
	for await (const event of client.events.list({ created, limit: 100 })) {
		const object: unknown = event.data.object
		if (Reflect.get(Object(object), 'customer') === customer) return true
	}
	return false
}

/**
 * Archives what the run made: its test clocks go with their customers and
 * subscriptions, and its products and prices are archived.
 */
export async function archived(): Promise<void> {
	for (const clock of clocks) await client.testHelpers.testClocks.del(clock)
	const keys = new Set<string>(products.map(({ key }) => key))
	for await (const product of client.products.list({
		limit: 100,
		active: true,
	})) {
		if (!keys.has(product.metadata['key'] ?? '')) continue
		for await (const price of client.prices.list({ product: product.id })) {
			if (price.active) await client.prices.update(price.id, { active: false })
		}
		await client.products.update(product.id, { active: false })
	}
}
