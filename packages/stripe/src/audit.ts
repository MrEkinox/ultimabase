// The daily audit (D-379): it logs a balance that is not the sum of its
// history, and a payment Stripe took with no purchase. It never writes.
import type { RecurringJob } from '@ultimabase/jobs'
import { defineJob } from '@ultimabase/jobs'
import type { Logger } from 'ultimabase'
import { transaction } from 'ultimabase'
import type { BillingGateway, RecoveryGateway } from './billing-gateway.ts'
import { M, StripeCustomer } from './models.ts'
import type { Billing, Running } from './running.ts'
import { runningOf } from './running.ts'

const hour = 60 * 60 * 1000
/** The owners, or the customers, read at once. */
const page = 500
/** The oldest payment read: two runs overlap, so a skipped one loses none. */
const oldest = 48 * hour
/** The newest payment read: the hourly reconciliation heals it first. */
const newest = 2 * hour

const idOf = (value: unknown): string | undefined => {
	const id: unknown =
		typeof value === 'object' && value !== null
			? Reflect.get(value, 'id')
			: undefined
	return typeof id === 'string' ? id : undefined
}

const numberOf = (value: unknown): number =>
	typeof value === 'number' ? value : 0

type Sum = { owner: string; credit: string; sum: number }
type Row = Readonly<Record<string, unknown>>

/** Each owner's sums, by `owner credit`, from rows or groups. */
function sums(rows: readonly Row[], read: (row: Row) => number) {
	const found = new Map<string, Sum>()
	for (const row of rows) {
		const owner = idOf(row.owner)
		const { credit } = row
		if (owner === undefined || typeof credit !== 'string') continue
		found.set(`${owner} ${credit}`, { owner, credit, sum: read(row) })
	}
	return found
}

/** Logs each balance of these owners that is not the sum of its history. */
async function auditOwners(
	balance: Billing,
	history: Billing,
	ids: readonly string[],
	logger: Logger,
): Promise<void> {
	const where = { owner: { is: { id: { in: ids } } } }
	const [balances, moves] = await transaction(
		async () =>
			[
				await balance.queries.findMany(
					{
						where,
						select: {
							owner: { select: { id: true } },
							credit: true,
							amount: true,
						},
					},
					M,
				),
				await history.queries.groupBy(
					{ by: ['owner', 'credit'], where, _sum: { change: true } },
					M,
				),
			] as const,
		{ isolation: 'serializable' },
	)
	const held = sums(balances, (row) => numberOf(row.amount))
	const summed = sums(moves, (row) =>
		numberOf(Reflect.get(Object(row['_sum']), 'change')),
	)
	for (const key of new Set([...held.keys(), ...summed.keys()])) {
		const one = held.get(key) ?? summed.get(key)
		const amount = held.get(key)?.sum ?? 0
		const sum = summed.get(key)?.sum ?? 0
		if (one === undefined || amount === sum) continue
		const { owner, credit } = one
		logger.error(
			{ owner, credit, balance: amount, history: sum },
			'A balance is not the sum of its history.',
		)
	}
}

/** Each balance is the sum of its history (D-379 point 2). */
async function auditBalances(running: Running, logger: Logger): Promise<void> {
	const { balance, history } = running
	if (balance === undefined || history === undefined) return
	let cursor: string | undefined
	for (;;) {
		const owners = await balance.payer.queries.findMany(
			{
				select: { id: true },
				orderBy: { id: 'asc' },
				take: page,
				...(cursor === undefined ? {} : { cursor: { id: cursor }, skip: 1 }),
			},
			M,
		)
		const ids = owners.map(({ id }) => id)
		if (ids.length > 0) await auditOwners(balance, history, ids, logger)
		cursor = ids.at(-1)
		if (ids.length < page) return
	}
}

/** Each payment Stripe took has its purchase (D-379 point 3). */
async function auditPayments(
	gateway: BillingGateway & RecoveryGateway,
	purchase: Billing,
	running: Running,
	logger: Logger,
): Promise<void> {
	const now = Date.now()
	const changed = await gateway.changedSince(new Date(now - oldest))
	const ids = [...changed.keys()]
	for (let at = 0; at < ids.length; at += page) {
		const stripeId = { in: ids.slice(at, at + page) }
		const where = { stripeId, model: purchase.payer.name }
		for (const row of await StripeCustomer.findMany({ where }, M)) {
			if (row.stripeId === null) continue
			const { payments } = await gateway.readCustomer(row.stripeId)
			const paid = payments.filter(({ product, paidAt }) => {
				const age = now - paidAt.getTime()
				return (
					product !== null &&
					running.products.has(product) &&
					age >= newest &&
					age <= oldest
				)
			})
			if (paid.length === 0) continue
			const kept = await purchase.queries.findMany(
				{ where: { stripeId: { in: paid.map(({ id }) => id) } } },
				M,
			)
			const known = new Set(kept.map((one) => one.stripeId))
			for (const { id, customerId, paidAt } of paid) {
				if (known.has(id)) continue
				logger.error(
					{ payment: id, customer: customerId, paidAt: paidAt.toISOString() },
					'A paid payment has no purchase.',
				)
			}
		}
	}
}

/** Every day: the ledger's balances, then Stripe's payments (D-379). */
async function audit(logger: Logger): Promise<void> {
	const running = runningOf('stripe.audit')
	await auditBalances(running, logger)
	// Last, so that an unreachable Stripe leaves the ledger audited.
	const { stripe, purchase } = running
	if (stripe !== undefined && purchase !== undefined) {
		await auditPayments(stripe.gateway, purchase, running, logger)
	}
}

export const auditJob: RecurringJob<'stripe.audit'> = defineJob({
	name: 'stripe.audit',
	every: 24 * hour,
	run: ({ logger }) => audit(logger),
})
