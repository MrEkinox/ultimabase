// `stripePlugin(options)` (D-371): the webhook, the jobs, the billing
// models' hooks, and at start the checks of D-372 point 5 and the catalog
// compared with Stripe, applied in development with a test key.
import type { Http } from '@ultimabase/http'
import { httpPlugin } from '@ultimabase/http'
import type { Jobs } from '@ultimabase/jobs'
import { jobsPlugin } from '@ultimabase/jobs'
import type {
	Caller,
	ExposedModel,
	Logger,
	PluginOf,
	PluginTypes,
	UseOf,
} from 'ultimabase'
import { definePlugin, isMaster, PublicError, Refused } from 'ultimabase'
import manifest from '../package.json' with { type: 'json' }
import { gatewayOf } from './accounts.ts'
import { catalogOf } from './apply.ts'
import type { CustomerProfile } from './billing-gateway.ts'
import type { Catalog } from './catalog.ts'
import { applyCatalog, planCatalog } from './catalog.ts'
import { describeStep } from './describe.ts'
import { stripeClient } from './gateway.ts'
import { closeJob, stripeJobs } from './jobs.ts'
import { ownKeys } from './keys.ts'
import type { Kind } from './kinds.ts'
import { billingModels } from './kinds.ts'
import { StripeCreditEntry, StripeCustomer, StripeEvent } from './models.ts'
import type { PortalOptions } from './portal.ts'
import type { Product } from './product.ts'
import type { Billing, Running } from './running.ts'
import { rowsOf, runningOf, useRunning } from './running.ts'
import { webhookRoutes } from './webhook.ts'

/** What `stripePlugin` takes (D-371 point 2). */
export interface StripeOptions {
	/** `undefined`: the application starts, and payments are unavailable. */
	readonly keys:
		{ readonly secret: string; readonly webhook: string } | undefined
	/** Every price's currency, in lowercase: `eur`. */
	readonly currency: string
	/** `'inclusive'`, by default, when the amounts include the taxes. */
	readonly taxBehavior?: 'inclusive' | 'exclusive'
	readonly products: readonly Product[]
	readonly portal: PortalOptions
	/**
	 * What Stripe shows of a payer, from its row: type the parameter with the
	 * payer's record, `(user: UserRecord) => ({ email: user.email })`.
	 */
	readonly customer?: (payer: never) => CustomerProfile
	/** `/webhooks/stripe` by default. */
	readonly webhookPath?: string
	/** One live subscription per payer (D-373 point 6). */
	readonly oneSubscription?: boolean
}

/** The Stripe plugin's types (D-57). */
export interface Stripe extends PluginTypes {
	readonly name: 'stripe'
	readonly appOptions: StripeOptions
	readonly requires: Http | Jobs
	readonly errors:
		| 'PAYMENT_UNAVAILABLE'
		| 'ALREADY_SUBSCRIBED'
		| 'NOT_SUBSCRIBED'
		| 'NOT_ENOUGH_CREDITS'
}

const entry = 'stripePlugin'
const optionKeys = [
	'keys',
	'currency',
	'taxBehavior',
	'products',
	'portal',
	'customer',
	'webhookPath',
	'oneSubscription',
]
const names = {
	subscription: 'defineSubscription',
	purchase: 'definePurchase',
	balance: 'defineBalance',
}

/** The keys, refused when one of them is unset. */
function keysOf(keys: unknown): StripeOptions['keys'] {
	if (keys === undefined) return undefined
	ownKeys(`${entry}'s keys`, keys, ['secret', 'webhook'])
	const secret: unknown = Reflect.get(keys, 'secret')
	const webhook: unknown = Reflect.get(keys, 'webhook')
	if (typeof secret !== 'string' || !secret.startsWith('sk_')) {
		throw new Refused(`${entry}: keys.secret is the secret key, sk_….`)
	}
	if (typeof webhook !== 'string' || !webhook.startsWith('whsec_')) {
		throw new Refused(`${entry}: keys.webhook is the signing secret, whsec_….`)
	}
	return { secret, webhook }
}

/** The one model of `kind` among the application's, with its payer's. */
function billingOf(
	models: readonly ExposedModel[],
	kind: Kind,
): Billing | undefined {
	const own = models.flatMap((model) => {
		const declared = billingModels.get(model.queries)
		return declared?.kind === kind ? [{ model, declared }] : []
	})
	const [first, second] = own
	if (second !== undefined) {
		throw new Refused(
			`models lists two models ${names[kind]} returned: an application has one.`,
		)
	}
	if (first === undefined) return undefined
	const target = first.declared.payer()
	const payer = models.find(({ queries }) => queries === target)
	const name = first.model.schema.name
	// The kernel refuses a relation to a model the application lacks.
	if (payer === undefined) throw new TypeError(`${name}'s payer is unknown.`)
	return {
		name,
		queries: rowsOf(first.model.queries),
		payer: { name: payer.schema.name, queries: rowsOf(payer.queries) },
	}
}

type Models = Pick<Running, 'subscription' | 'purchase' | 'balance'>

/** Refuses a product no model records (D-372 point 5, D-374 point 1). */
function checkModels(products: readonly Product[], models: Models): void {
	const { subscription, purchase, balance } = models
	if (purchase && balance && purchase.payer.name !== balance.payer.name) {
		throw new Refused(
			`${balance.name}'s owner and ${purchase.name}'s payer are one model.`,
		)
	}
	for (const product of products) {
		if ('prices' in product && subscription === undefined) {
			throw new Refused(
				`${product.key} is a subscription: declare its model with defineSubscription.`,
			)
		}
		if (!('prices' in product) && product.gives.length > 0 && !balance) {
			throw new Refused(
				`${product.key} gives credits: declare their model with defineBalance.`,
			)
		}
	}
}

/**
 * Compares the catalog with Stripe: applied with `NODE_ENV=development` and
 * a test key, otherwise each difference is logged (D-372 point 4).
 */
async function compare(running: Running, logger: Logger): Promise<void> {
	const { stripe, catalog } = running
	if (stripe === undefined) return
	const { gateway, live } = stripe
	try {
		const state = await gateway.readCatalog()
		const steps = planCatalog(catalog, state)
		if (steps.length === 0) return
		const changes = steps.map((step) => describeStep(step, catalog.currency))
		if (process.env['NODE_ENV'] !== 'development' || live) {
			logger.warn(
				{ changes },
				'The Stripe catalog differs from the code: apply it with applyStripeCatalog.',
			)
			return
		}
		for (const change of changes) logger.info(`Stripe catalog: ${change}`)
		await applyCatalog(catalog, gateway, state, steps)
	} catch (error) {
		logger.warn({ err: error }, 'The Stripe catalog could not be compared.')
	}
}

/** Only Master, so the plugin, writes a billing model (D-373 point 4). */
const masterOnly =
	(operation: 'create' | 'update' | 'delete') =>
	({ caller, name }: { readonly caller: Caller; readonly name: string }) => {
		if (isMaster(caller)) return
		const details = { model: name, operation }
		const callerId = caller.kind === 'user' ? caller.user.id : null
		const message = `${name} ${operation} refused.`
		runningOf(entry).logger.warn({ ...details, callerId }, message)
		throw new PublicError('ACCESS_DENIED', message, { details })
	}

/** Closes the customer of a payer whose billing rows its delete removed. */
async function closeLater(name: string, record: object): Promise<void> {
	const running = runningOf(entry)
	const billing = [running.subscription, running.purchase, running.balance]
	const model = billing.find((one) => one?.name === name)
	// The row holds its payer as `{ id }`.
	const ref: unknown =
		Reflect.get(record, 'payer') ?? Reflect.get(record, 'owner')
	const payer: unknown = Reflect.get(Object(ref), 'id')
	if (running.stripe === undefined || model === undefined) return
	if (typeof payer !== 'string') return
	await closeJob.enqueue({ model: model.payer.name, payer })
}

const definition = definePlugin<Stripe>({
	name: 'stripe',
	manifest,
	requires: { http: httpPlugin, jobs: jobsPlugin },
	models: [StripeCustomer, StripeEvent, StripeCreditEntry],
	api: ({ plugins, options }) => {
		const { webhookPath = '/webhooks/stripe' } = options
		if (typeof webhookPath !== 'string' || !webhookPath.startsWith('/')) {
			throw new Refused(`${entry}: webhookPath is a path, as /webhooks/stripe.`)
		}
		plugins.http.mount(webhookRoutes(webhookPath))
		plugins.jobs.add(stripeJobs)
	},
	hooks: {
		beforeCreate: masterOnly('create'),
		beforeUpdate: masterOnly('update'),
		beforeDelete: masterOnly('delete'),
		afterDelete: ({ name, record }) => closeLater(name, record),
	},
	start: async ({ options, models, logger }) => {
		ownKeys(entry, options, optionKeys)
		const keys = keysOf(options.keys)
		const catalog: Catalog = catalogOf(entry, options)
		const { customer, oneSubscription = false } = options
		if (customer !== undefined && typeof customer !== 'function') {
			throw new Refused(`${entry}: customer is (payer) => its profile.`)
		}
		if (typeof oneSubscription !== 'boolean') {
			throw new Refused(`${entry}: oneSubscription is true or false.`)
		}
		const billing = {
			subscription: billingOf(models, 'subscription'),
			purchase: billingOf(models, 'purchase'),
			balance: billingOf(models, 'balance'),
		}
		checkModels(catalog.products, billing)
		const running: Running = {
			stripe:
				keys === undefined
					? undefined
					: {
							gateway: gatewayOf(keys.secret),
							client: stripeClient(keys.secret),
							webhook: keys.webhook,
							live: keys.secret.includes('_live_'),
						},
			catalog,
			products: new Map(catalog.products.map((one) => [one.key, one])),
			customer,
			oneSubscription,
			...billing,
			logger,
			portal: undefined,
		}
		useRunning(running)
		await compare(running, logger)
	},
	stop: () => {
		useRunning(undefined)
	},
})

/** Payments on Stripe's hosted pages; it requires `httpPlugin` and `jobsPlugin`. */
export const stripePlugin: PluginOf<Stripe> = definition.plugin
/** The plugin's entry in a billing model's `use`, which `define*` adds. */
export const stripeUse: UseOf<Stripe> = definition.use
