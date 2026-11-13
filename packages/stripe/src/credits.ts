// Credits (D-374): a paid purchase adds what its product gives, once per
// payment; a full refund or a lost dispute takes it back, down to zero; the
// application spends them in its own transaction. Each move is written to
// `StripeCreditEntry`.
import { PublicError, transaction } from 'ultimabase'
import type { StripePayment } from './billing-gateway.ts'
import type { CreditAmount } from './credit.ts'
import { M, StripeCreditEntry } from './models.ts'
import type { OneTimeProduct } from './product.ts'
import type { Billing, Row } from './running.ts'
import { runningOf } from './running.ts'

type Owner = { readonly id: string }

/** Each credit's total, in the order first named. */
function totals(credits: readonly CreditAmount[]): Map<string, number> {
	const sums = new Map<string, number>()
	for (const { credit, amount } of credits) {
		sums.set(credit, (sums.get(credit) ?? 0) + amount)
	}
	return sums
}

/** The owner's balances of `credits`, their rows locked by the update. */
async function lockedBalances(
	balance: Billing,
	owner: string,
	credits: readonly string[],
): Promise<Map<string, Row>> {
	const where = { owner: { is: { id: owner } }, credit: { in: credits } }
	const data = { amount: { increment: 0 } }
	const rows = await balance.queries.updateManyAndReturn({ where, data }, M)
	return new Map(rows.map((row) => [String(row['credit']), row]))
}

const amountOf = (row: Row | undefined): number =>
	typeof row?.['amount'] === 'number' ? row['amount'] : 0

async function entry(
	balance: Billing,
	owner: string,
	move: { credit: string; change: number; reason: string },
	payment: string | null = null,
): Promise<void> {
	const data = { model: balance.payer.name, owner, ...move, payment }
	await StripeCreditEntry.create({ data }, M)
}

/**
 * Lowers each of the owner's balances, in the caller's transaction when it
 * has one; `NOT_ENOUGH_CREDITS` when one would fall below zero, with
 * nothing changed (D-374 point 2).
 */
export async function spend(
	owner: Owner,
	credits: CreditAmount | readonly CreditAmount[],
	options: { readonly reason: string },
): Promise<void> {
	const { balance } = runningOf('stripe.spend')
	if (balance === undefined) {
		throw new Error('stripe.spend needs a model defineBalance returned.')
	}
	const sums = totals(Array.isArray(credits) ? credits : [credits])
	await transaction(async () => {
		const held = await lockedBalances(balance, owner.id, [...sums.keys()])
		const spent = [...sums].map(([credit, needed]) => {
			const row = held.get(credit)
			const left = amountOf(row)
			if (row === undefined || left < needed) {
				throw new PublicError('NOT_ENOUGH_CREDITS', `Not enough ${credit}.`, {
					details: { credit, balance: left, needed },
				})
			}
			return { id: row.id, credit, needed }
		})
		for (const { id, credit, needed } of spent) {
			const data = { amount: { decrement: needed } }
			await balance.queries.update({ where: { id }, data }, M)
			const move = { credit, change: -needed, reason: options.reason }
			await entry(balance, owner.id, move)
		}
	})
}

/** Whether the payment's credits were given, or taken back. */
const moved = async (payment: string, reason: string): Promise<boolean> =>
	(await StripeCreditEntry.findFirst({ where: { payment, reason } }, M)) !==
	null

/**
 * Gives what a paid purchase gives, once per payment, and takes it back
 * after a full refund or a lost dispute, once, down to zero (D-374).
 */
export async function settleCredits(
	owner: string,
	payment: StripePayment,
	product: OneTimeProduct,
): Promise<void> {
	const { balance, logger } = runningOf('stripe')
	if (balance === undefined || product.gives.length === 0) return
	const sums = totals(product.gives)
	if (!(await moved(payment.id, 'purchase'))) {
		for (const [credit, amount] of sums) {
			await balance.queries.upsert(
				{
					where: { owner, credit },
					create: { owner: { connect: { id: owner } }, credit, amount },
					update: { amount: { increment: amount } },
				},
				M,
			)
			const move = { credit, change: amount, reason: 'purchase' }
			await entry(balance, owner, move, payment.id)
		}
	}
	const lost = payment.disputeLost || payment.refunded >= payment.amount
	if (!lost || (await moved(payment.id, 'refund'))) return
	const held = await lockedBalances(balance, owner, [...sums.keys()])
	for (const [credit, amount] of sums) {
		const row = held.get(credit)
		const taken = Math.min(amount, amountOf(row))
		if (taken < amount) {
			const details = { owner, credit, payment: payment.id }
			logger.warn(
				{ ...details, spent: amount - taken },
				`${credit} of a refunded payment were already spent: they stay spent.`,
			)
		}
		if (row !== undefined && taken > 0) {
			const data = { amount: { decrement: taken } }
			await balance.queries.update({ where: { id: row.id }, data }, M)
		}
		const move = { credit, change: -taken, reason: 'refund' }
		await entry(balance, owner, move, payment.id)
	}
}
