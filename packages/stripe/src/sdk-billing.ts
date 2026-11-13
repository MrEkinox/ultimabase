// The billing gateway over Stripe's API: what `gatewayOf` gives a real
// secret key. Stripe's errors become the plugin's: `PAYMENT_UNAVAILABLE`
// when Stripe cannot answer, `Missing` for an object it does not hold.
import type { Stripe } from 'stripe'
import type {
	BillingGateway,
	CustomerProfile,
	PortalFlow,
} from './billing-gateway.ts'
import { Missing } from './billing-gateway.ts'
import { managedBy } from './gateway.ts'
import type { Ref } from './sdk-common.ts'
import { all, guarded, refOf } from './sdk-common.ts'
import { gone, stateOf } from './sdk-customer.ts'
const profileParams = (profile: CustomerProfile) => ({
	...(profile.email != null && { email: profile.email }),
	...(profile.name != null && { name: profile.name }),
	...(profile.locale != null && { preferred_locales: [profile.locale] }),
})
/** The customer an object belongs to, read from Stripe. */
export async function ownerOf(
	client: Stripe,
	type: string,
	id: string,
): Promise<Ref> {
	switch (type) {
		case 'customer':
			return id
		case 'checkout.session':
			return (await client.checkout.sessions.retrieve(id)).customer
		case 'subscription':
			return (await client.subscriptions.retrieve(id)).customer
		case 'subscription_schedule':
			return (await client.subscriptionSchedules.retrieve(id)).customer
		case 'invoice':
			return (await client.invoices.retrieve(id)).customer
		case 'payment_intent':
			return (await client.paymentIntents.retrieve(id)).customer
		case 'charge':
			return (await client.charges.retrieve(id)).customer
		case 'dispute': {
			const { charge } = await client.disputes.retrieve(id)
			const chargeId = refOf(charge)
			return chargeId === null
				? null
				: (await client.charges.retrieve(chargeId)).customer
		}
		default:
			return null
	}
}

/** The active price of a lookup key, or a bug: the catalog was not applied. */
async function priceId(client: Stripe, lookupKey: string): Promise<string> {
	const listed = await client.prices.list({
		lookup_keys: [lookupKey],
		active: true,
		limit: 1,
	})
	const [price] = listed.data
	if (price === undefined) {
		throw new Error(
			`Stripe holds no active price ${lookupKey}: apply the catalog.`,
		)
	}
	return price.id
}

async function flowOf(
	client: Stripe,
	flow: PortalFlow,
	returnUrl: string,
): Promise<Stripe.BillingPortal.SessionCreateParams.FlowData | undefined> {
	const after = {
		type: 'redirect' as const,
		redirect: { return_url: returnUrl },
	}
	if (flow.kind === 'cancel') {
		return {
			type: 'subscription_cancel',
			subscription_cancel: { subscription: flow.subscriptionId },
			after_completion: after,
		}
	}
	if (flow.kind === 'home') return undefined
	const subscription = await client.subscriptions.retrieve(flow.subscriptionId)
	const [item] = subscription.items.data
	if (item === undefined) throw new Error('The subscription has no item.')
	// The quantity is kept (D-373 point 8).
	const price = await priceId(client, flow.lookupKey)
	return {
		type: 'subscription_update_confirm',
		subscription_update_confirm: {
			subscription: flow.subscriptionId,
			items: [{ id: item.id, price, quantity: item.quantity ?? 1 }],
		},
		after_completion: after,
	}
}
/** The billing gateway over Stripe's API. */
export const sdkBilling = (client: Stripe): BillingGateway => ({
	createCustomer: async (profile, idempotencyKey) =>
		guarded('customer', async () => {
			const params = { ...profileParams(profile), metadata: { managedBy } }
			const created = await client.customers.create(params, {
				idempotencyKey,
			})
			return created.id
		}),
	updateCustomer: async (id, profile) =>
		guarded(id, async () => {
			await client.customers.update(id, profileParams(profile))
		}),
	deleteCustomer: async (id) => {
		try {
			await guarded(id, async () => client.customers.del(id))
		} catch (error) {
			if (!(error instanceof Missing)) throw error
		}
	},
	readCustomer: async (id, options) => {
		try {
			const asked = {
				invoices: options?.invoices ?? false,
				free: options?.free ?? false,
			}
			return await guarded(id, async () => stateOf(client, id, asked))
		} catch (error) {
			if (error instanceof Missing) return gone
			throw error
		}
	},
	customerOf: async (type, id) => {
		try {
			return refOf(await guarded(id, async () => ownerOf(client, type, id)))
		} catch (error) {
			if (error instanceof Missing) return null
			throw error
		}
	},
	openCheckout: async (checkout) =>
		guarded(checkout.customerId, async () => {
			const price = await priceId(client, checkout.lookupKey)
			const metadata = {
				...checkout.metadata,
				managedBy,
				product: checkout.product,
				// A purchase keeps its quantity: its credits are so many times.
				...(checkout.mode === 'payment' && {
					quantity: String(checkout.quantity),
				}),
			}
			const session = await client.checkout.sessions.create({
				mode: checkout.mode,
				customer: checkout.customerId,
				client_reference_id: checkout.reference,
				line_items: [{ price, quantity: checkout.quantity }],
				success_url: checkout.successUrl,
				cancel_url: checkout.cancelUrl,
				metadata,
				...(checkout.terms && {
					consent_collection: { terms_of_service: 'required' },
				}),
				...(checkout.promotionCodes && { allow_promotion_codes: true }),
				...(checkout.mode === 'subscription'
					? {
							subscription_data: {
								metadata,
								...(checkout.trialDays !== null && {
									trial_period_days: checkout.trialDays,
								}),
							},
						}
					: { payment_intent_data: { metadata } }),
			})
			if (session.url === null) throw new Error('Checkout gave no URL.')
			return session.url
		}),
	expireCheckouts: async (customerId) =>
		guarded(customerId, async () => {
			const open = await all(
				client.checkout.sessions.list({
					customer: customerId,
					status: 'open',
					limit: 100,
				}),
			)
			for (const { id } of open) await client.checkout.sessions.expire(id)
		}),
	checkoutCustomer: async (id) => {
		try {
			const session = await guarded(id, async () =>
				client.checkout.sessions.retrieve(id),
			)
			return refOf(session.customer)
		} catch (error) {
			if (error instanceof Missing) return null
			throw error
		}
	},
	openPortal: async ({ customerId, configuration, returnUrl, flow }) =>
		guarded(customerId, async () => {
			const flowData = await flowOf(client, flow, returnUrl)
			const session = await client.billingPortal.sessions.create({
				customer: customerId,
				return_url: returnUrl,
				...(configuration !== null && { configuration }),
				...(flowData !== undefined && { flow_data: flowData }),
			})
			return session.url
		}),
})
