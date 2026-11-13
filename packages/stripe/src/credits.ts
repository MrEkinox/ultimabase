// Credits (D-374, D-377): a paid purchase or subscription invoice adds what
// it gives, once; a full refund or a lost dispute takes it back, down to
// zero; the application grants and spends them in its own transaction. Each
// move is written to the application's credit history.
import { PublicError, transaction } from 'ultimabase'
import type { CreditAmount } from './credit.ts'
import { M } from './models.ts'
import type { Billing, Row } from './running.ts'
import { runningOf } from './running.ts'

type Owner = { readonly id: string }

/** A paid payment or invoice, as its credits read it. */
export interface Paid {
	readonly id: string
	readonly amount: number
	readonly refunded: number
	readonly disputeLost: boolean
}

/** Whether a full refund or a lost dispute takes its credits back. */
export const lost = (paid: Paid): boolean =>
	// A free invoice, after a full coupon, is never refunded.
	paid.disputeLost || (paid.amount > 0 && paid.refunded >= paid.amount)

/** Each credit's total, `times` over, in the order first named. */
export function totals(
	credits: readonly CreditAmount[],
	times = 1,
	sums: Map<string, number> = new Map(),
): Map<string, number> {
	for (const { credit, amount } of credits) {
		sums.set(credit, (sums.get(credit) ?? 0) + amount * times)
	}
	return sums
}

const listOf = (
	credits: CreditAmount | readonly CreditAmount[],
): readonly CreditAmount[] => ('credit' in credits ? [credits] : credits)

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

/** The balance and history models, which come together (D-377 point 2). */
function creditModels(name: string): {
	readonly balance: Billing
	readonly history: Billing
} {
	const { balance, history } = runningOf(name)
	if (balance === undefined || history === undefined) {
		throw new Error(`${name} needs a model defineBalance returned.`)
	}
	return { balance, history }
}

/** Adds to the owner's balance of `credit`, creating it at the first move. */
async function add(
	balance: Billing,
	owner: string,
	credit: string,
	amount: number,
): Promise<void> {
	await balance.queries.upsert(
		{
			where: { owner, credit },
			create: { owner: { connect: { id: owner } }, credit, amount },
			update: { amount: { increment: amount } },
		},
		M,
	)
}

async function entry(
	history: Billing,
	owner: string,
	move: { credit: string; change: number; reason: string },
	payment: string | null = null,
): Promise<void> {
	const data = { owner: { connect: { id: owner } }, ...move, payment }
	await history.queries.create({ data }, M)
}

/**
 * Adds to each of the owner's balances without a payment, in the caller's
 * transaction when it has one (D-377 point 1).
 */
export async function grant(
	owner: Owner,
	credits: CreditAmount | readonly CreditAmount[],
	options: { readonly reason: string },
): Promise<void> {
	const { balance, history } = creditModels('stripe.grant')
	const sums = totals(listOf(credits))
	await transaction(async () => {
		for (const [credit, amount] of sums) {
			await add(balance, owner.id, credit, amount)
			const move = { credit, change: amount, reason: options.reason }
			await entry(history, owner.id, move)
		}
	})
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
	const { balance, history } = creditModels('stripe.spend')
	const sums = totals(listOf(credits))
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
			await entry(history, owner.id, move)
		}
	})
}

/** What the history shows a payment gave, by credit, and whether it was taken back. */
async function movesOf(
	history: Billing,
	payment: string,
): Promise<{ readonly given: Map<string, number>; readonly taken: boolean }> {
	const rows = await history.queries.findMany({ where: { payment } }, M)
	const given = new Map<string, number>()
	for (const row of rows) {
		if (row['reason'] === 'refund' || typeof row['change'] !== 'number')
			continue
		const credit = String(row['credit'])
		given.set(credit, (given.get(credit) ?? 0) + row['change'])
	}
	return { given, taken: rows.some((row) => row['reason'] === 'refund') }
}

/**
 * Gives the credits `sums` a paid payment or invoice gives, once, and takes
 * back what it gave after a full refund or a lost dispute, once, down to
 * zero (D-374, D-377 point 4).
 */
export async function settleCredits(
	owner: string,
	paid: Paid,
	sums: ReadonlyMap<string, number>,
	reason: 'purchase' | 'subscription',
): Promise<void> {
	const { balance, history, logger } = runningOf('stripe')
	if (balance === undefined || history === undefined) return
	const moves = await movesOf(history, paid.id)
	let given = moves.given
	if (given.size === 0 && !moves.taken) {
		for (const [credit, amount] of sums) {
			await add(balance, owner, credit, amount)
			await entry(history, owner, { credit, change: amount, reason }, paid.id)
		}
		given = new Map(sums)
	}
	if (!lost(paid) || moves.taken || given.size === 0) return
	const held = await lockedBalances(balance, owner, [...given.keys()])
	for (const [credit, amount] of given) {
		const row = held.get(credit)
		const taken = Math.min(amount, amountOf(row))
		if (taken < amount) {
			const details = { owner, credit, payment: paid.id }
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
		await entry(history, owner, move, paid.id)
	}
}
