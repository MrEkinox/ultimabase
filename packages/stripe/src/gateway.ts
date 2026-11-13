// Stripe, behind the narrow gateway the plugin calls. `sdkGateway` reaches
// Stripe through its SDK; `@ultimabase/stripe/testing` holds a fake in
// memory, and no test of `yarn validate` reaches Stripe.
import { Stripe } from 'stripe'
import type { Every } from './product.ts'
import { all } from './sdk-common.ts'

/** How often a price bills: Stripe's `interval` and `interval_count`. */
export interface Recurring<E extends string = string> {
	readonly every: E
	readonly count: number
}

/** A product the catalog manages, as Stripe holds it. */
export interface StripeProduct {
	readonly id: string
	/** Its `metadata.key`. */
	readonly key: string | null
	readonly name: string
	readonly active: boolean
	readonly taxCode: string | null
}

/** A price, as Stripe holds it. */
export interface StripePrice {
	readonly id: string
	readonly productId: string
	readonly lookupKey: string | null
	readonly amount: number | null
	readonly currency: string
	/** `null` for a one-time price. */
	readonly recurring: Recurring | null
	readonly taxBehavior: string | null
	readonly nickname: string | null
	readonly active: boolean
	readonly metadata: Readonly<Record<string, string>>
}

/** A product the portal lets a subscription move to, with its prices. */
export interface PortalProduct {
	readonly productId: string
	readonly priceIds: readonly string[]
}

/** The customer portal's configuration, as the catalog writes it. */
export interface PortalSettings {
	readonly returnUrl: string | null
	readonly termsUrl: string | null
	readonly privacyUrl: string | null
	/** `always_invoice` or `create_prorations`. */
	readonly prorationBehavior: string
	/** Whether a downgrade waits for the period's end. */
	readonly scheduleAtPeriodEnd: readonly string[]
	/** `end_trial` or `continue_trial`. */
	readonly trialUpdate: string
	/** `at_period_end` or `immediately`. */
	readonly cancelMode: string
	/** The reasons a payer may give on canceling; none asks nothing. */
	readonly cancelReasons: readonly string[]
	/** `null` when Stripe did not list them. */
	readonly products: readonly PortalProduct[] | null
	readonly active: boolean
}

/** What Stripe holds of the catalog. */
export interface CatalogState {
	/** The managed products, archived ones included. */
	readonly products: readonly StripeProduct[]
	/** Every price, archived ones included. */
	readonly prices: readonly StripePrice[]
	/** The managed portal configuration, if one was saved. */
	readonly portal: {
		readonly id: string
		readonly settings: PortalSettings
	} | null
}

/** A product as the catalog writes it. */
export interface ProductWrite {
	readonly key: string
	readonly name: string
	readonly taxCode: string | null
}

/** A price as the catalog writes it: Stripe never changes its billing. */
export interface PriceWrite {
	readonly productId: string
	readonly lookupKey: string
	readonly amount: number
	readonly currency: string
	/** `null` for a one-time price. */
	readonly recurring: Recurring<Every> | null
	readonly taxBehavior: 'inclusive' | 'exclusive'
	readonly nickname: string
	readonly metadata: Readonly<Record<string, string>>
}

/** What the plugin asks Stripe. */
export interface StripeGateway {
	/** The managed products, every price, and the managed portal. */
	readonly readCatalog: () => Promise<CatalogState>
	/** Creates a managed product; returns its id. */
	readonly createProduct: (product: ProductWrite) => Promise<string>
	/** Renames a product, sets its tax code, and makes it active. */
	readonly updateProduct: (id: string, product: ProductWrite) => Promise<void>
	readonly archiveProduct: (id: string) => Promise<void>
	/** Creates a price, which takes its lookup key over; returns its id. */
	readonly createPrice: (price: PriceWrite) => Promise<string>
	/** Sets a price's nickname and metadata. */
	readonly updatePrice: (
		id: string,
		price: Pick<PriceWrite, 'nickname' | 'metadata'>,
	) => Promise<void>
	readonly archivePrice: (id: string) => Promise<void>
	/** Creates the portal configuration, or updates `id`; returns its id. */
	readonly savePortal: (
		id: string | null,
		settings: PortalSettings,
	) => Promise<string>
}

/** `metadata.managedBy` of what the catalog writes: nothing else is touched. */
export const managedBy = 'ultimabase'

/** The API version the plugin reads Stripe's objects with: the SDK's. */
const apiVersion = '2026-10-28.endive'

/** The Stripe client of a secret key. */
export const stripeClient = (secret: string): Stripe =>
	new Stripe(secret, {
		apiVersion,
		maxNetworkRetries: 2,
		// A request past 10 s fails, and its caller retries.
		timeout: 10_000,
	})

const idOf = (value: string | { readonly id: string }): string =>
	typeof value === 'string' ? value : value.id

const priceOf = (price: Stripe.Price): StripePrice => ({
	id: price.id,
	productId: idOf(price.product),
	lookupKey: price.lookup_key,
	amount: price.unit_amount,
	currency: price.currency,
	recurring:
		price.recurring === null
			? null
			: {
					every: price.recurring.interval,
					count: price.recurring.interval_count,
				},
	taxBehavior: price.tax_behavior,
	nickname: price.nickname,
	active: price.active,
	metadata: price.metadata,
})

const portalOf = (
	portal: Stripe.BillingPortal.Configuration,
): PortalSettings => {
	const update = portal.features.subscription_update
	const cancel = portal.features.subscription_cancel
	return {
		returnUrl: portal.default_return_url,
		termsUrl: portal.business_profile.terms_of_service_url,
		privacyUrl: portal.business_profile.privacy_policy_url,
		prorationBehavior: update.proration_behavior,
		scheduleAtPeriodEnd: update.schedule_at_period_end.conditions.map(
			({ type }) => type,
		),
		trialUpdate: update.trial_update_behavior,
		cancelMode: cancel.mode,
		cancelReasons: cancel.cancellation_reason.enabled
			? cancel.cancellation_reason.options
			: [],
		products:
			update.products?.map(({ product, prices }) => ({
				productId: product,
				priceIds: prices,
			})) ?? null,
		active: portal.active,
	}
}

/** The configuration's parameters, from `settings`. */
export const portalParams = (
	settings: PortalSettings,
): Stripe.BillingPortal.ConfigurationCreateParams => {
	const products = settings.products ?? []
	return {
		business_profile: {
			...(settings.termsUrl !== null && {
				terms_of_service_url: settings.termsUrl,
			}),
			...(settings.privacyUrl !== null && {
				privacy_policy_url: settings.privacyUrl,
			}),
		},
		...(settings.returnUrl !== null && {
			default_return_url: settings.returnUrl,
		}),
		features: {
			subscription_update: {
				// The portal refuses an update with no product to move to.
				enabled: products.length > 0,
				default_allowed_updates: ['price'],
				products: products.map(({ productId, priceIds }) => ({
					product: productId,
					prices: [...priceIds],
				})),
				proration_behavior: settings.prorationBehavior,
				trial_update_behavior: settings.trialUpdate,
				schedule_at_period_end: {
					conditions: settings.scheduleAtPeriodEnd.map((type) => ({ type })),
				},
			},
			subscription_cancel: {
				enabled: true,
				mode: settings.cancelMode,
				// An empty string clears the options, on an update too.
				cancellation_reason:
					settings.cancelReasons.length > 0
						? { enabled: true, options: [...settings.cancelReasons] }
						: { enabled: false, options: '' },
			},
			payment_method_update: { enabled: true },
			invoice_history: { enabled: true },
		},
		metadata: { managedBy },
	}
}

/** The gateway over Stripe's API. */
export const sdkGateway = (client: Stripe): StripeGateway => ({
	readCatalog: async () => {
		// Three lists, whatever the catalog's size.
		const [products, prices, portals] = await Promise.all([
			all(client.products.list({ limit: 100 })),
			all(client.prices.list({ limit: 100 })),
			all(
				client.billingPortal.configurations.list({
					limit: 100,
					expand: ['data.features.subscription_update.products'],
				}),
			),
		])
		const portal = portals.find(
			({ metadata }) => metadata?.['managedBy'] === managedBy,
		)
		return {
			products: products
				.filter(({ metadata }) => metadata['managedBy'] === managedBy)
				.map((product) => ({
					id: product.id,
					key: product.metadata['key'] ?? null,
					name: product.name,
					active: product.active,
					taxCode:
						product.tax_code === null || product.tax_code === undefined
							? null
							: idOf(product.tax_code),
				})),
			prices: prices.map(priceOf),
			portal:
				portal === undefined
					? null
					: { id: portal.id, settings: portalOf(portal) },
		}
	},
	createProduct: async ({ key, name, taxCode }) => {
		const created = await client.products.create({
			name,
			...(taxCode !== null && { tax_code: taxCode }),
			metadata: { managedBy, key },
		})
		return created.id
	},
	updateProduct: async (id, { key, name, taxCode }) => {
		await client.products.update(id, {
			name,
			active: true,
			// An empty string unsets it.
			tax_code: taxCode ?? '',
			metadata: { managedBy, key },
		})
	},
	archiveProduct: async (id) => {
		await client.products.update(id, { active: false })
	},
	createPrice: async (price) => {
		const created = await client.prices.create({
			product: price.productId,
			currency: price.currency,
			unit_amount: price.amount,
			...(price.recurring !== null && {
				recurring: {
					interval: price.recurring.every,
					interval_count: price.recurring.count,
				},
			}),
			tax_behavior: price.taxBehavior,
			lookup_key: price.lookupKey,
			transfer_lookup_key: true,
			nickname: price.nickname,
			metadata: { ...price.metadata },
		})
		return created.id
	},
	updatePrice: async (id, { nickname, metadata }) => {
		await client.prices.update(id, { nickname, metadata: { ...metadata } })
	},
	archivePrice: async (id) => {
		await client.prices.update(id, { active: false })
	},
	savePortal: async (id, settings) => {
		const params = portalParams(settings)
		if (id === null) {
			return (await client.billingPortal.configurations.create(params)).id
		}
		// Stripe drops an empty list or an absent key, keeping the old value:
		// an update clears a setting with an empty string.
		const { subscription_update: update } = params.features
		const conditions = update?.schedule_at_period_end?.conditions ?? []
		await client.billingPortal.configurations.update(id, {
			...params,
			business_profile: {
				terms_of_service_url: settings.termsUrl ?? '',
				privacy_policy_url: settings.privacyUrl ?? '',
			},
			features: {
				...params.features,
				subscription_update: {
					...update,
					schedule_at_period_end: {
						conditions: conditions.length > 0 ? conditions : '',
					},
				},
			},
			active: true,
		})
		return id
	},
})
