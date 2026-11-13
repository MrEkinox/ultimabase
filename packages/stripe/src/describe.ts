// A catalog step in a line, as `applyStripeCatalog` prints its plan.
import type { CatalogStep } from './catalog.ts'
import type { Recurring, StripePrice } from './gateway.ts'

/** An amount in the currency's smallest unit, as `9.90 EUR`. */
const formatAmount = (amount: number, currency: string): string => {
	const digits = Number(
		new Intl.NumberFormat('en', {
			style: 'currency',
			currency,
		}).resolvedOptions().maximumFractionDigits,
	)
	return `${(amount / 10 ** digits).toFixed(digits)} ${currency.toUpperCase()}`
}

const often = (recurring: Recurring | null): string =>
	recurring === null
		? 'once'
		: recurring.count === 1
			? `every ${recurring.every}`
			: `every ${String(recurring.count)} ${recurring.every}s`

const billing = (
	amount: number | null,
	currency: string,
	recurring: Recurring | null,
): string =>
	`${amount === null ? 'no amount' : formatAmount(amount, currency)} ${often(recurring)}`

const priceName = (price: StripePrice): string =>
	price.lookupKey === null ? price.id : `${price.lookupKey} (${price.id})`

/** What an update changes of a product. */
const productChanges = (
	step: Extract<CatalogStep, { readonly kind: 'updateProduct' }>,
): string => {
	const { product, was } = step
	return [
		...(was.active ? [] : ['restore it']),
		...(was.name === product.name
			? []
			: [`rename it from "${was.name}" to "${product.name}"`]),
		...(was.taxCode === product.taxCode
			? []
			: [`set its tax code to ${product.taxCode ?? 'none'}`]),
	].join(', ')
}

/** The step in a line. */
export const describeStep = (step: CatalogStep, currency: string): string => {
	if (step.kind === 'createProduct') {
		return `create the product ${step.product.key}: "${step.product.name}"`
	}
	if (step.kind === 'updateProduct') {
		return `update the product ${step.product.key}: ${productChanges(step)}`
	}
	if (step.kind === 'archiveProduct') {
		return `archive the product "${step.was.name}" (${step.was.id})`
	}
	if (step.kind === 'createPrice') {
		const { price, replaces } = step
		const line = `create the price ${price.lookupKey}: ${billing(price.amount, currency, price.recurring)}`
		return replaces === null
			? line
			: `${line}, replacing ${replaces.id} (${billing(replaces.amount, replaces.currency, replaces.recurring)})`
	}
	if (step.kind === 'updatePrice') {
		return `update the nickname and metadata of the price ${priceName(step.was)}`
	}
	if (step.kind === 'archivePrice') {
		return `archive the price ${priceName(step.was)}`
	}
	return step.id === null
		? 'create the customer portal configuration'
		: `update the customer portal configuration ${step.id}`
}
