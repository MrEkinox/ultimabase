// What the sandbox suite (`yarn test:stripe`, D-371 point 8) runs on: a
// Stripe sandbox's secret key, a catalog of its run's own, payers whose
// customers sit on test clocks, and the events Stripe lists, posted signed
// to the webhook as Stripe would, or forwarded by Stripe's own CLI. It never
// reads a live key, and never prints the key.
import { execFileSync, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { httpPlugin } from '@ultimabase/http'
import { jobsPlugin } from '@ultimabase/jobs'
import { runJobs } from '@ultimabase/testing'
import type { Stripe } from 'stripe'
import { allow, defineApp, master, memory } from 'ultimabase'
import { definePurchase, defineSubscription } from '../billing.ts'
import { stripeClient } from '../gateway.ts'
import { StripeCustomer } from '../models.ts'
import type { StripeOptions } from '../plugin.ts'
import type { PortalOptions } from '../portal.ts'
import { stripePlugin } from '../plugin.ts'
import { defineProduct } from '../product.ts'
import { postEvent, thinEvent } from '../testing.ts'
import { Balance, CreditHistory, gems, User } from './billing-app.ts'

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

// The Stripe CLI reads the key from its environment, never its arguments.
const cliEnv = { ...process.env, STRIPE_API_KEY: secret }
const noCli =
	'yarn test:stripe needs the Stripe CLI: brew install stripe/stripe-cli/stripe.'

/** The keys of an application whose events the Stripe CLI signs. */
export function cliKeys(): {
	readonly secret: string
	readonly webhook: string
} {
	try {
		const options = { env: cliEnv, encoding: 'utf8' as const, timeout: 60_000 }
		const signing = execFileSync(
			'stripe',
			['listen', '--print-secret'],
			options,
		)
		return { secret, webhook: signing.trim() }
	} catch (cause) {
		throw new Error(noCli, { cause })
	}
}

/**
 * Forwards Stripe's own thin events, signed by its CLI, to the webhook of
 * the application at `url`, until the returned function stops it.
 */
export async function forwarded(url: string): Promise<() => void> {
	const target = `${url}/webhooks/stripe`
	const cli = spawn(
		'stripe',
		['listen', '--all-thin', '--forward-to', target],
		{
			env: cliEnv,
			stdio: ['ignore', 'ignore', 'pipe'],
		},
	)
	await new Promise<void>((resolve, reject) => {
		cli.once('error', (cause) => {
			reject(new Error(noCli, { cause }))
		})
		cli.once('exit', () => {
			reject(new Error('stripe listen ended before it was ready.'))
		})
		// Its log, which holds the signing secret, is read and never printed.
		cli.stderr.on('data', (chunk: Buffer) => {
			if (chunk.toString('utf8').includes('Ready!')) resolve()
		})
	})
	return () => {
		cli.kill()
	}
}

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
export const portal: PortalOptions = {
	returnUrl: 'https://example.com/account',
	cancelReasons: ['too_expensive', 'other'],
}

// This run's keys are new each run, so no enum lists them: its rows keep
// strings, as an application without enums.
export const Subscription = defineSubscription({
	name: 'Subscription',
	payer: () => User,
}).with({ access: allow.public })
export const Purchase = definePurchase({
	name: 'Purchase',
	payer: () => User,
}).with({ access: allow.public })

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
				customer: (user: {
					readonly email: string
					readonly lang: string | null
				}) => ({ email: user.email, locale: user.lang }),
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
	readonly clock: string
}> {
	const email = `${run}@example.com`
	// Checkout knows no fr-BE: its page speaks fr (D-382).
	const data = { email, lang: 'fr-BE' }
	const payer = await User.create({ data }, { as: master })
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
	return { payer, customer, method, clock: clock.id }
}

/** Moves a test clock `days` ahead, once Stripe ran what that time does. */
export async function advanced(clock: string, days: number): Promise<void> {
	const testClocks = client.testHelpers.testClocks
	const { frozen_time: now } = await testClocks.retrieve(clock)
	await testClocks.advance(clock, { frozen_time: now + days * 24 * 60 * 60 })
	for (let tries = 0; tries < 90; tries += 1) {
		const { status } = await testClocks.retrieve(clock)
		if (status === 'ready') return
		if (status === 'internal_failure') throw new Error('The clock failed.')
		await new Promise((resolve) => setTimeout(resolve, 2_000))
	}
	throw new Error('The test clock took more than 3 minutes.')
}

const posted = new Set<string>()

/**
 * Posts the events Stripe listed since the run began, each once, as thin
 * events signed with the webhook's secret, then runs the jobs: what the
 * Stripe CLI would forward, with no CLI. They come newest first, out of the
 * order they happened in; `again`, a customer, posts its events once more,
 * as Stripe does when an answer is lost.
 */
export async function delivered(
	url: string,
	options: { readonly again?: string } = {},
): Promise<void> {
	const created = { gte: began }
	for await (const event of client.events.list({ created, limit: 100 })) {
		const object: unknown = event.data.object
		const again =
			options.again !== undefined &&
			Reflect.get(Object(object), 'customer') === options.again
		if (posted.has(event.id) && !again) continue
		posted.add(event.id)
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
