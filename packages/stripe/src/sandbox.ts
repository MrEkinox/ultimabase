// @ultimabase/stripe/sandbox (D-401): what an application's own tests run
// on against a Stripe sandbox, as UltimaBase's nightly suite does: payers on
// test clocks, the run's events posted signed to the webhook, the catalog
// checked against the code, and what the run made deleted at the end.
import { randomBytes } from 'node:crypto'
import { runJobs } from '@ultimabase/testing'
import type { Stripe } from 'stripe'
import { Refused } from 'ultimabase'
import { gatewayOf } from './accounts.ts'
import { type StripeCatalogOptions, catalogOf } from './apply.ts'
import { planCatalog } from './catalog.ts'
import { describeStep } from './describe.ts'
import { postEvent, thinEvent } from './fake-events.ts'
import { managedBy, stripeClient } from './gateway.ts'
import { ownKeys } from './keys.ts'
import { M, StripeCustomer } from './models.ts'
import { ownerOf } from './sdk-billing.ts'
import { refOf } from './sdk-common.ts'

/** What `stripeSandbox` takes. */
export interface SandboxOptions {
	/** The sandbox's secret key, sk_test_…; `undefined` is refused, as an unset variable. */
	readonly secret: string | undefined
	/** The webhook secret of the application's `stripePlugin`, which signs what `deliver` posts. */
	readonly webhook: string
}

/** The catalog `expectCatalog` compares: `applyStripeCatalog`'s, without its key. */
export type SandboxCatalog = Omit<StripeCatalogOptions, 'secret' | 'dryRun'>

/** What `payer` makes at Stripe. */
export interface SandboxPayer {
	readonly customer: string
	/** The test clock the customer sits on, which `advance` moves. */
	readonly clock: string
	/** The card the customer pays with by default. */
	readonly method: string
}

/**
 * A Stripe sandbox, and what a test does there. Its helpers are functions
 * that need no `this`: `const { deliver, cleanup } = sandbox` works.
 */
export interface StripeSandbox {
	/** Stripe's client, on the sandbox. */
	readonly client: Stripe
	/** This run's name, `ub_<time>_<random>`, in what it makes at Stripe. */
	readonly run: string
	/** An address of this run, `<run>-<name>@example.com`, deleted by `cleanup`. */
	readonly email: (name: string) => string
	/**
	 * The one customer of `email`, which Checkout or `payer` made; `deliver`
	 * posts its events.
	 */
	readonly customerOf: (email: string) => Promise<string>
	/** Gives the customer a card, `pm_card_visa` by default, it pays with by default. */
	readonly payWith: (customer: string, card?: string) => Promise<string>
	/** A price's id, by its lookup key: `pro.monthly`. */
	readonly priceId: (lookupKey: string) => Promise<string>
	/** Throws the changes the sandbox needs to match the catalog, if any. */
	readonly expectCatalog: (options: SandboxCatalog) => Promise<void>
	/**
	 * A customer for the payer row `id` of `model`, on a test clock of its
	 * own, with a card that pays: the plugin uses it as the one it would make.
	 */
	readonly payer: (options: {
		readonly model: { readonly name: string }
		readonly id: string
		readonly email?: string
		readonly card?: string
	}) => Promise<SandboxPayer>
	/** Moves a test clock `days` ahead, once Stripe ran what that time does. */
	readonly advance: (
		clock: string,
		options: { readonly days: number },
	) => Promise<void>
	/**
	 * Posts this run's customers' events, each once, signed, to the webhook
	 * of the application at `url`, then runs the jobs. `again`, a customer,
	 * posts its events once more, as Stripe does when an answer is lost.
	 */
	readonly deliver: (
		url: string,
		options?: { readonly again?: string; readonly path?: string },
	) => Promise<void>
	/** Deletes this run's test clocks, and the customers of its addresses. */
	readonly cleanup: () => Promise<void>
}

const entry = 'stripeSandbox'
const day = 24 * 60 * 60

/** The sandbox's key, or an error that says what to give. */
function sandboxKey(secret: unknown): string {
	if (typeof secret !== 'string' || secret === '') {
		throw new Refused(
			`${entry}: secret is the secret key of a Stripe sandbox, sk_test_…: set it in the environment that runs these tests.`,
		)
	}
	if (!secret.startsWith('sk_test_')) {
		throw new Refused(
			`${entry} runs on a sandbox only: secret is a test secret key, sk_test_….`,
		)
	}
	return secret
}

/** A string field of an object Stripe sent, or `undefined`. */
const read = (object: unknown, key: string): string | undefined => {
	const value: unknown = Reflect.get(Object(object), key)
	return typeof value === 'string' ? value : undefined
}

/** Whether a Stripe call failed because the object is gone. */
const missing = (error: unknown): boolean =>
	Reflect.get(Object(error), 'code') === 'resource_missing'

/** A Stripe sandbox for tests that run against it. */
export function stripeSandbox(options: SandboxOptions): StripeSandbox {
	ownKeys(entry, options, ['secret', 'webhook'])
	const secret = sandboxKey(options.secret)
	const { webhook } = options
	if (typeof webhook !== 'string' || webhook === '') {
		throw new Refused(
			`${entry}: webhook is the webhook secret of the application's stripePlugin.`,
		)
	}
	const client = stripeClient(secret)
	const run = `ub_${Date.now().toString(36)}_${randomBytes(3).toString('hex')}`
	// A minute early: a test clock's first events may predate the run's start.
	const began = Math.floor(Date.now() / 1000) - 60
	const emails = new Set<string>()
	const customers = new Set<string>()
	const found = new Set<string>()
	const clocks: string[] = []
	// `payer`'s customers by address: on a test clock, `customers.list`
	// leaves them out.
	const payers: { readonly email: string; readonly customer: string }[] = []
	const posted = new Set<string>()
	const owners = new Map<string, Promise<string | null>>()

	/** The customer an event's object belongs to, asked once per object. */
	const ownerOfObject = async (object: unknown): Promise<string | null> => {
		const kind = read(object, 'object') ?? ''
		const id = read(object, 'id') ?? ''
		if (kind === 'customer') return id
		const customer: unknown = Reflect.get(Object(object), 'customer')
		if (typeof customer === 'string') return customer
		const nested = read(customer, 'id')
		if (nested !== undefined) return nested
		// A dispute or a fraud warning names its charge only.
		let owner = owners.get(id)
		if (owner === undefined) {
			owner = ownerOf(client, kind, id).then(refOf)
			owners.set(id, owner)
		}
		return owner
	}

	const payWith = async (
		customer: string,
		card = 'pm_card_visa',
	): Promise<string> => {
		const { id } = await client.paymentMethods.attach(card, { customer })
		await client.customers.update(customer, {
			invoice_settings: { default_payment_method: id },
		})
		return id
	}

	return {
		client,
		run,
		email: (name) => {
			const email = `${run}-${name}@example.com`
			emails.add(email)
			return email
		},
		customerOf: async (email) => {
			const { data } = await client.customers.list({ email, limit: 2 })
			const ids = [
				...payers
					.filter((made) => made.email === email)
					.map(({ customer }) => customer),
				...data.map(({ id }) => id),
			]
			const [customer] = ids
			if (customer === undefined || ids.length > 1) {
				throw new Error(
					`Stripe holds ${ids.length === 0 ? 'no' : 'several'} customers of ${email}: expected one.`,
				)
			}
			customers.add(customer)
			found.add(customer)
			return customer
		},
		payWith,
		priceId: async (lookupKey) => {
			const { data } = await client.prices.list({
				lookup_keys: [lookupKey],
				active: true,
				limit: 1,
			})
			const [price] = data
			if (price === undefined) {
				throw new Error(`No active price of the sandbox is ${lookupKey}.`)
			}
			return price.id
		},
		expectCatalog: async (catalogOptions) => {
			const where = 'expectCatalog'
			ownKeys(where, catalogOptions, [
				'currency',
				'taxBehavior',
				'products',
				'portal',
			])
			const catalog = catalogOf(where, catalogOptions)
			const steps = planCatalog(catalog, await gatewayOf(secret).readCatalog())
			if (steps.length === 0) return
			const lines = steps.map(
				(step) => `  ${describeStep(step, catalog.currency)}`,
			)
			throw new Error(
				[
					`The sandbox's catalog differs from the code, ${String(steps.length)} change${steps.length === 1 ? '' : 's'}:`,
					...lines,
					'applyStripeCatalog with the sandbox key applies them.',
				].join('\n'),
			)
		},
		payer: async ({ model, id, email, card }) => {
			const clock = await client.testHelpers.testClocks.create({
				frozen_time: Math.floor(Date.now() / 1000),
				name: run,
			})
			clocks.push(clock.id)
			const { id: customer } = await client.customers.create({
				...(email === undefined ? {} : { email }),
				test_clock: clock.id,
				metadata: { managedBy },
			})
			customers.add(customer)
			if (email !== undefined) payers.push({ email, customer })
			const method = await payWith(customer, card)
			await StripeCustomer.create(
				{ data: { model: model.name, payer: id, stripeId: customer } },
				M,
			)
			return { customer, clock: clock.id, method }
		},
		advance: async (clock, { days }) => {
			if (typeof days !== 'number' || !(days > 0)) {
				throw new Refused('advance: days is a positive number.')
			}
			const testClocks = client.testHelpers.testClocks
			const { frozen_time: now } = await testClocks.retrieve(clock)
			await testClocks.advance(clock, {
				frozen_time: now + Math.round(days * day),
			})
			for (let tries = 0; tries < 90; tries += 1) {
				const { status } = await testClocks.retrieve(clock)
				if (status === 'ready') return
				if (status === 'internal_failure') {
					throw new Error(`The test clock ${clock} failed at Stripe.`)
				}
				await new Promise((resolve) => setTimeout(resolve, 2_000))
			}
			throw new Error(`The test clock ${clock} took more than 3 minutes.`)
		},
		deliver: async (url, { again, path } = {}) => {
			const created = { gte: began }
			for await (const event of client.events.list({ created, limit: 100 })) {
				const seen = posted.has(event.id)
				const object: unknown = event.data.object
				const owner = await ownerOfObject(object)
				if (owner === null || !customers.has(owner)) continue
				if (seen && owner !== again) continue
				posted.add(event.id)
				const id = read(object, 'id')
				const type = read(object, 'object')
				if (id === undefined || type === undefined) continue
				const payload = thinEvent({
					id: event.id,
					type: event.type,
					object: { id, type },
				})
				const response = await postEvent(url, payload, {
					secret: webhook,
					path,
				})
				if (!response.ok) {
					throw new Error(
						`The webhook answered ${String(response.status)} to ${event.type}.`,
					)
				}
			}
			await runJobs()
		},
		cleanup: async () => {
			// A clock's customers go with it.
			for (const clock of clocks.splice(0)) {
				await client.testHelpers.testClocks.del(clock)
			}
			const ids = new Set(found)
			for (const email of emails) {
				for await (const customer of client.customers.list({ email })) {
					ids.add(customer.id)
				}
			}
			for (const id of ids) {
				try {
					await client.customers.del(id)
				} catch (error) {
					if (!missing(error)) throw error
				}
			}
			found.clear()
		},
	}
}
