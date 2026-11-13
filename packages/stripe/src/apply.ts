// `applyStripeCatalog` (D-372 point 4): an application's deploy script
// brings its Stripe account to the catalog, with no running application.
// It prints the plan, a line a change, and applies it unless `dryRun`.
import { Refused } from 'ultimabase'
import { gatewayOf } from './accounts.ts'
import { type Catalog, applyCatalog, planCatalog } from './catalog.ts'
import { describeStep } from './describe.ts'
import { ownKeys } from './keys.ts'
import { type PortalOptions, checkPortal } from './portal.ts'
import type { Product } from './product.ts'

/** What `applyStripeCatalog` brings a Stripe account to. */
export interface StripeCatalogOptions {
	/** The account's secret key; `undefined` is refused, as an unset variable. */
	readonly secret: string | undefined
	/** Every price's currency, in lowercase: `eur`. */
	readonly currency: string
	/** `'inclusive'`, by default, when the amounts include the taxes. */
	readonly taxBehavior?: 'inclusive' | 'exclusive'
	readonly products: readonly Product[]
	readonly portal: PortalOptions
	/** Prints the plan and changes nothing. */
	readonly dryRun?: boolean
}

const entry = 'applyStripeCatalog'
const optionKeys = [
	'secret',
	'currency',
	'taxBehavior',
	'products',
	'portal',
	'dryRun',
]

const print = (line: string): void => {
	process.stdout.write(`${line}\n`)
}

type CatalogOptions = Pick<
	StripeCatalogOptions,
	'currency' | 'taxBehavior' | 'products' | 'portal'
>

/**
 * The catalog of `options`, shared with `stripePlugin`; refuses what Stripe
 * would refuse, and a product named twice (D-372 point 5).
 */
export function catalogOf(caller: string, options: CatalogOptions): Catalog {
	const { currency, taxBehavior = 'inclusive', products, portal } = options
	if (typeof currency !== 'string' || !/^[a-z]{3}$/u.test(currency)) {
		throw new Refused(`${caller}: currency is a lowercase ISO code, as eur.`)
	}
	if (!['inclusive', 'exclusive'].includes(taxBehavior)) {
		throw new Refused(`${caller}: taxBehavior is 'inclusive' or 'exclusive'.`)
	}
	// `Array.isArray` would type the products `any[]`.
	const listed: unknown = products
	if (!Array.isArray(listed)) {
		throw new Refused(`${caller}: products lists what defineProduct returns.`)
	}
	const keys = new Set<string>()
	for (const { key } of products) {
		if (keys.has(key)) {
			throw new Refused(`${caller}: two products have the key ${key}.`)
		}
		keys.add(key)
	}
	checkPortal(portal)
	return { currency, taxBehavior, products, portal }
}

/** Brings the Stripe account of `secret` to the catalog, unless `dryRun`. */
export async function applyStripeCatalog(
	options: StripeCatalogOptions,
): Promise<void> {
	ownKeys(entry, options, optionKeys)
	const { secret, dryRun = false } = options
	if (typeof secret !== 'string' || secret === '') {
		throw new Refused(`${entry}: secret is the account's secret key, sk_….`)
	}
	const catalog = catalogOf(entry, options)
	const { currency } = catalog
	const gateway = gatewayOf(secret)
	const state = await gateway.readCatalog()
	const steps = planCatalog(catalog, state)
	const mode = secret.includes('_live_') ? 'live' : 'test'
	if (steps.length === 0) {
		print(`Stripe catalog (${mode} mode): up to date.`)
		return
	}
	print(
		`Stripe catalog (${mode} mode): ${String(steps.length)} change${steps.length === 1 ? '' : 's'}${dryRun ? ', dry run' : ''}:`,
	)
	for (const step of steps) print(`  ${describeStep(step, currency)}`)
	if (dryRun) return
	await applyCatalog(catalog, gateway, state, steps)
	print('Stripe catalog: applied.')
}
