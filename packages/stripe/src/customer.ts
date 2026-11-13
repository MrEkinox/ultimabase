// A payer's Stripe customer (D-373 point 3): one row per payer in
// `StripeCustomer`, whose update is the lock every write about the payer
// takes, and one customer at Stripe, created once.
import type { RecordOf } from 'ultimabase'
import { PublicError, transaction } from 'ultimabase'
import type { CustomerProfile } from './billing-gateway.ts'
import { Missing } from './billing-gateway.ts'
import { M, StripeCustomer } from './models.ts'
import type { Billing, Row } from './running.ts'
import { runningOf, stripeOf } from './running.ts'

export type Customer = RecordOf<typeof StripeCustomer>

/** The payer's row of `model`, read as Master, or `NOT_FOUND`. */
export async function payerRow(
	payer: Billing['payer'],
	id: string,
): Promise<Row> {
	const row = await payer.queries.findUnique({ where: { id } }, M)
	if (row !== null) return row
	throw new PublicError('NOT_FOUND', `No ${payer.name} matches payer.`, {
		details: { model: payer.name },
	})
}

/** The payer's customer row, created on its first use. */
export async function customerRow(
	model: string,
	payer: string,
): Promise<Customer> {
	const where = { model, payer }
	const held = await StripeCustomer.findUnique({ where }, M)
	if (held !== null) return held
	try {
		return await StripeCustomer.create({ data: where }, M)
	} catch (error) {
		// Another call created it first.
		if (!(error instanceof PublicError && error.code === 'UNIQUE_VIOLATION')) {
			throw error
		}
		return StripeCustomer.findUniqueOrThrow({ where }, M)
	}
}

/**
 * Runs `run` in a transaction holding the customer's row, so one write
 * about a payer runs at a time; `undefined` when the row is gone.
 */
export async function locked<R>(
	id: string,
	run: (row: Customer) => Promise<R>,
): Promise<R | undefined> {
	return transaction(async () => {
		const data = { lockedAt: new Date() }
		const [row] = await StripeCustomer.updateManyAndReturn(
			{ where: { id }, data },
			M,
		)
		return row === undefined ? undefined : run(row)
	})
}

/** What Stripe shows of the payer, from the `customer` option. */
export function profileOf(payer: object): CustomerProfile {
	const { customer } = runningOf('stripe')
	const given: unknown =
		customer === undefined ? {} : Reflect.apply(customer, undefined, [payer])
	const read = (key: string): string | null => {
		const value: unknown =
			typeof given === 'object' && given !== null
				? Reflect.get(given, key)
				: undefined
		return typeof value === 'string' ? value : null
	}
	return { email: read('email'), name: read('name'), locale: read('locale') }
}

/** A new row for the payer of `row`, whose customer Stripe deleted. */
export async function renewed(row: Customer): Promise<Customer> {
	await StripeCustomer.delete({ where: { id: row.id } }, M)
	const data = { model: row.model, payer: row.payer }
	return StripeCustomer.create({ data }, M)
}

/**
 * The payer's customer at Stripe, under its lock: created once, with an
 * idempotency key, and given the payer's profile when it changed. A customer
 * deleted at Stripe gives the payer a new row, so a new key.
 */
export async function ensureCustomer(
	row: Customer,
	payer: Row,
): Promise<{
	readonly row: Customer
	readonly stripeId: string
	readonly profile: CustomerProfile
}> {
	const { gateway } = stripeOf('stripe')
	const profile = profileOf(payer)
	const json = JSON.stringify(profile)
	if (row.stripeId !== null) {
		if (row.profile === json) return { row, stripeId: row.stripeId, profile }
		try {
			await gateway.updateCustomer(row.stripeId, profile)
		} catch (error) {
			if (!(error instanceof Missing)) throw error
			return ensureCustomer(await renewed(row), payer)
		}
		const data = { profile: json }
		await StripeCustomer.update({ where: { id: row.id }, data }, M)
		return { row, stripeId: row.stripeId, profile }
	}
	const stripeId = await gateway.createCustomer(profile, `customer-${row.id}`)
	const data = { stripeId, profile: json }
	await StripeCustomer.update({ where: { id: row.id }, data }, M)
	return { row, stripeId, profile }
}
