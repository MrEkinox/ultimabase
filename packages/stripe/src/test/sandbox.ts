// What the sandbox suite (`yarn test:stripe`, D-371 point 8) runs on: the
// `@ultimabase/stripe/sandbox` an application's tests take (D-401), a
// catalog of its run's own, and Stripe's own events, forwarded by its CLI.
// It never reads a live key, and never prints the key.
import { execFileSync, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { httpPlugin } from '@ultimabase/http'
import { jobsPlugin } from '@ultimabase/jobs'
import { allow, defineApp, master, memory } from 'ultimabase'
import { definePurchase, defineSubscription } from '../billing.ts'
import type { StripeOptions } from '../plugin.ts'
import type { PortalOptions } from '../portal.ts'
import { stripePlugin } from '../plugin.ts'
import { defineProduct } from '../product.ts'
import { stripeSandbox } from '../sandbox.ts'
import { Balance, CreditHistory, gems, User } from './billing-app.ts'

// The suite runs on what an application's tests run on (D-401).
const secret = process.env['STRIPE_SECRET_KEY'] ?? ''
const webhook = `whsec_${randomBytes(24).toString('base64')}`
export const sandbox = stripeSandbox({ secret, webhook })
export const { client, run } = sandbox

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

/** When this run began, in Stripe's seconds. */
const began = Math.floor(Date.now() / 1000)

/** How long a run may hold the sandbox: the CI job's limit. */
const longestRun = 20 * 60 * 1000

/**
 * Refuses to start while another run holds the sandbox (D-393): this run's
 * catalog would archive that run's, and fail its payments. A run older than
 * the CI job's limit is over: the catalog archives what it left.
 */
export async function alone(): Promise<void> {
	for await (const product of client.products.list({
		limit: 100,
		active: true,
	})) {
		const key = product.metadata['key'] ?? ''
		const other = /^(ub_([0-9a-z]+)_[0-9a-f]{6})_/u.exec(key)
		if (other?.[1] === undefined || other[1] === run) continue
		const started = Number.parseInt(other[2] ?? '', 36)
		if (Date.now() - started < longestRun) {
			const at = new Date(started).toISOString().slice(11, 16)
			throw new Error(
				`Another sandbox run, ${other[1]}, started at ${at} UTC, is using this sandbox: run again once it ends.`,
			)
		}
	}
}

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

/** The payer's address: the run's, deleted at the end. */
const email = sandbox.email('payer')

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
	// Checkout knows no fr-BE: its page speaks fr (D-382).
	const data = { email, lang: 'fr-BE' }
	const payer = await User.create({ data }, { as: master })
	const made = await sandbox.payer({ model: User, id: payer.id, email })
	return { payer, ...made }
}

/** Whether Stripe lists an event of `customer` since the run began. */
export async function listed(customer: string): Promise<boolean> {
	const created = { gte: began }
	for await (const event of client.events.list({ created, limit: 100 })) {
		const object: unknown = event.data.object
		if (Reflect.get(Object(object), 'customer') === customer) return true
	}
	return false
}

/**
 * Deletes what the run made, its test clocks with their customers and
 * subscriptions, and archives its products and prices.
 */
export async function archived(): Promise<void> {
	await sandbox.cleanup()
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
