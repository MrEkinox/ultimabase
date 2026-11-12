// The customer portal's options (D-373 point 8), in Stripe's words: how a
// change of plan bills, which changes wait for the period's end, what a
// change during a trial does, and how a cancellation ends.
import { Refused } from 'ultimabase'
import type { PortalProduct, PortalSettings } from './gateway.ts'
import { ownKeys } from './keys.ts'

/** How the customer portal lets a payer change plan and cancel. */
export interface PortalOptions {
	/** Where the portal's return link leads. */
	readonly returnUrl: string
	readonly termsUrl?: string
	readonly privacyUrl?: string
	/** `'invoiceNow'` charges a dearer plan's difference at once. */
	readonly upgrades?: 'invoiceNow' | 'nextInvoice'
	/** `'atPeriodEnd'` starts a cheaper or shorter plan at the period's end. */
	readonly downgrades?: 'atPeriodEnd' | 'now'
	/** `'endTrial'` ends a trial on a change, and charges the new plan. */
	readonly trialChange?: 'endTrial' | 'keepTrial'
	/** `'atPeriodEnd'` ends a canceled subscription at its period's end. */
	readonly cancel?: 'atPeriodEnd' | 'now'
}

/** Each option's values, in Stripe's words; the first is the default. */
const choices = {
	upgrades: { invoiceNow: 'always_invoice', nextInvoice: 'create_prorations' },
	downgrades: { atPeriodEnd: true, now: false },
	trialChange: { endTrial: 'end_trial', keepTrial: 'continue_trial' },
	cancel: { atPeriodEnd: 'at_period_end', now: 'immediately' },
} as const
const urls = ['returnUrl', 'termsUrl', 'privacyUrl'] as const

/** Refuses portal options Stripe would refuse, naming the option. */
export function checkPortal(portal: unknown): asserts portal is PortalOptions {
	ownKeys('portal', portal, [...urls, ...Object.keys(choices)])
	for (const name of urls) {
		const url: unknown = Reflect.get(portal, name)
		if (url === undefined && name !== 'returnUrl') continue
		if (typeof url !== 'string' || !URL.canParse(url)) {
			throw new Refused(`portal: ${name} is an absolute URL.`)
		}
	}
	for (const [name, values] of Object.entries(choices)) {
		const value: unknown = Reflect.get(portal, name)
		if (value === undefined) continue
		if (typeof value !== 'string' || !Object.hasOwn(values, value)) {
			throw new Refused(
				`portal: ${name} is ${Object.keys(values)
					.map((one) => `'${one}'`)
					.join(' or ')}.`,
			)
		}
	}
}

/** The portal's settings, letting a subscription move to `products`. */
export const portalSettings = (
	portal: PortalOptions,
	products: readonly PortalProduct[] | null,
): PortalSettings => ({
	returnUrl: portal.returnUrl,
	termsUrl: portal.termsUrl ?? null,
	privacyUrl: portal.privacyUrl ?? null,
	prorationBehavior: choices.upgrades[portal.upgrades ?? 'invoiceNow'],
	// A cheaper plan, or a shorter interval, waits for the period's end.
	scheduleAtPeriodEnd: choices.downgrades[portal.downgrades ?? 'atPeriodEnd']
		? ['decreasing_item_amount', 'shortening_interval']
		: [],
	trialUpdate: choices.trialChange[portal.trialChange ?? 'endTrial'],
	cancelMode: choices.cancel[portal.cancel ?? 'atPeriodEnd'],
	products,
	active: true,
})

/** The settings in a string, whatever the order of their lists. */
const sorted = (settings: PortalSettings): string =>
	JSON.stringify([
		settings.returnUrl,
		settings.termsUrl,
		settings.privacyUrl,
		settings.prorationBehavior,
		settings.scheduleAtPeriodEnd.toSorted(),
		settings.trialUpdate,
		settings.cancelMode,
		settings.active,
		settings.products
			?.map(({ productId, priceIds }) => [productId, priceIds.toSorted()])
			.toSorted(([a], [b]) => String(a).localeCompare(String(b))),
	])

/** Whether two settings are the same, whatever the order of their lists. */
export const samePortal = (
	one: PortalSettings,
	other: PortalSettings,
): boolean => sorted(one) === sorted(other)
