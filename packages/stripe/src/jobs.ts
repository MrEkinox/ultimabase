// The plugin's jobs (D-371 point 5, D-375), named `stripe.*`: an event's
// sync, a customer's sync and close, a second subscription's refund, and the
// hourly reconciliation, which catches what a lost webhook or a failed job
// left behind.
import type { Job, RecurringJob } from '@ultimabase/jobs'
import { defineJob } from '@ultimabase/jobs'
import type { Customer } from './customer.ts'
import { locked } from './customer.ts'
import { strings } from './job-input.ts'
import type { RecoveryGateway } from './billing-gateway.ts'
import { duplicateJob } from './duplicates.ts'
import { M, StripeCustomer, StripeEvent, StripeScan } from './models.ts'
import type { Rows, Running } from './running.ts'
import { runningOf, stripeOf } from './running.ts'
import { syncCustomer } from './sync.ts'

const minute = 60 * 1000
const hour = 60 * minute
/**
 * How long a processed event stays: longer than Stripe retries a delivery
 * (3 days), so a late one is still stored once.
 */
const keepEvents = 90 * 24 * hour
/** The customers the reconciliation reads at once. */
const page = 500
/** The events a first scan reads back. */
const firstScan = 24 * hour
/** How far a scan reads again before the last one's end: Stripe lists late. */
const overlap = 10 * minute
/**
 * A sync that began this long after a customer's last event read it: the
 * margin covers the clocks' gap.
 */
const margin = minute

/** Syncs the customer a stored event is about, then marks it processed. */
export const eventJob: Job<'stripe.event', { readonly event: string }> =
	defineJob({
		name: 'stripe.event',
		input: strings('event'),
		key: ({ event }) => event,
		run: async ({ input }) => {
			const event = await StripeEvent.findUnique(
				{ where: { id: input.event } },
				M,
			)
			if (event === null || event.processedAt !== null) return
			const { gateway } = stripeOf('stripe.event')
			const customerId =
				event.objectId === ''
					? null
					: await gateway.customerOf(event.objectType, event.objectId)
			const where = { stripeId: customerId }
			const row =
				customerId === null
					? null
					: await StripeCustomer.findUnique({ where }, M)
			// Synced here: the event stays waiting, so retried, until it is.
			if (row !== null) await syncCustomer(row.id)
			const data = { processedAt: new Date() }
			await StripeEvent.update({ where: { id: event.id }, data }, M)
		},
	})

/** Syncs one customer, which the reconciliation found stale. */
const syncJob = defineJob({
	name: 'stripe.sync',
	input: strings('customer'),
	key: ({ customer }) => customer,
	run: async ({ input }) => {
		await syncCustomer(input.customer)
	},
})

/** The queries of each payer model, by name. */
const payersOf = (running: Running): ReadonlyMap<string, Rows> =>
	new Map(
		[running.subscription, running.purchase, running.balance].flatMap(
			(billing) =>
				billing === undefined
					? []
					: [[billing.payer.name, billing.payer.queries] as const],
		),
	)

/**
 * Closes the customer of a deleted payer: Stripe deletes it, which ends its
 * subscriptions, and its row goes. A payer still there keeps it.
 */
export const closeJob: Job<
	'stripe.close',
	{ readonly model: string; readonly payer: string }
> = defineJob({
	name: 'stripe.close',
	input: strings('model', 'payer'),
	key: ({ model, payer }) => `${model}:${payer}`,
	run: async ({ input, logger }) => {
		const running = runningOf('stripe.close')
		const { gateway } = stripeOf('stripe.close')
		const payers = payersOf(running).get(input.model)
		if (payers === undefined) {
			logger.warn(input, 'No billing model names this payer model.')
			return
		}
		const where = { id: input.payer }
		if ((await payers.findUnique({ where }, M)) !== null) return
		const held = await StripeCustomer.findUnique({ where: input }, M)
		if (held === null) return
		await locked(held.id, async (row: Customer) => {
			if (row.stripeId !== null) await gateway.deleteCustomer(row.stripeId)
			await StripeCustomer.delete({ where: { id: row.id } }, M)
		})
	},
})

/** Whether a customer's payer is gone, by its model's queries. */
async function goneOf(
	running: Running,
	rows: readonly Customer[],
): Promise<Set<string>> {
	const payers = payersOf(running)
	const gone = new Set<string>()
	for (const [model, held] of Map.groupBy(rows, (row) => row.model)) {
		const queries = payers.get(model)
		if (queries === undefined) continue
		const ids = held.map(({ payer }) => payer)
		const args = { where: { id: { in: ids } }, select: { id: true } }
		const found = new Set((await queries.findMany(args, M)).map((r) => r.id))
		for (const row of held) if (!found.has(row.payer)) gone.add(row.id)
	}
	return gone
}

/** Whether the customer needs a sync: its period ended since the last one. */
const stale = (row: Customer, now: number): boolean =>
	row.stripeId !== null &&
	row.renewsAt !== null &&
	row.renewsAt.getTime() <= now

/**
 * Closes the customers of deleted payers, and syncs those whose period
 * ended: a renewal whose events were lost. Pages by id from a cursor; a
 * cursor row deleted meanwhile ends the scan, and the next hour reads on.
 */
async function scanCustomers(running: Running, now: number): Promise<void> {
	const gone: { readonly model: string; readonly payer: string }[] = []
	for (let cursor: string | undefined; ;) {
		const rows = await StripeCustomer.findMany(
			{
				orderBy: { id: 'asc' },
				take: page,
				...(cursor === undefined ? {} : { cursor: { id: cursor }, skip: 1 }),
			},
			M,
		)
		const goneIds = await goneOf(running, rows)
		for (const row of rows) {
			if (goneIds.has(row.id)) gone.push(row)
			else if (stale(row, now)) await syncJob.enqueue({ customer: row.id })
		}
		cursor = rows.at(-1)?.id
		if (rows.length < page) break
	}
	// Closed once the scan ends, so that no close deletes its cursor row.
	for (const { model, payer } of gone) await closeJob.enqueue({ model, payer })
}

/**
 * Syncs the customers Stripe's events changed since the last scan and that
 * no sync read since: what a lost webhook missed (D-375). Its cost follows
 * the account's activity, not its number of customers.
 */
async function scanEvents(
	gateway: RecoveryGateway,
	now: number,
): Promise<void> {
	const where = { name: 'events' }
	const last = await StripeScan.findUnique({ where }, M)
	const since = (last?.until.getTime() ?? now - firstScan) - overlap
	const changed = await gateway.changedSince(new Date(since))
	const ids = [...changed.keys()]
	for (let at = 0; at < ids.length; at += page) {
		const stripeId = { in: ids.slice(at, at + page) }
		const rows = await StripeCustomer.findMany({ where: { stripeId } }, M)
		for (const row of rows) {
			const event = changed.get(row.stripeId ?? '')?.getTime() ?? now
			if (row.syncedAt === null || row.syncedAt.getTime() < event + margin) {
				await syncJob.enqueue({ customer: row.id })
			}
		}
	}
	const until = new Date(now)
	await StripeScan.upsert(
		{ where, create: { ...where, until }, update: { until } },
		M,
	)
}

/**
 * Every hour: closes the customers of deleted payers, syncs those past a
 * renewal, enqueues the events still waiting, deletes the old processed
 * ones, then syncs the customers whose events were lost.
 */
async function reconcile(): Promise<void> {
	const running = runningOf('stripe.reconcile')
	if (running.stripe === undefined) return
	const now = Date.now()
	await scanCustomers(running, now)
	const waiting = await StripeEvent.findMany(
		{ where: { processedAt: null }, select: { id: true } },
		M,
	)
	for (const { id } of waiting) await eventJob.enqueue({ event: id })
	const old = new Date(now - keepEvents)
	await StripeEvent.deleteMany({ where: { processedAt: { lt: old } } }, M)
	// Last, so that an unreachable Stripe leaves the rest done.
	await scanEvents(running.stripe.gateway, now)
}

const reconcileJob: RecurringJob<'stripe.reconcile'> = defineJob({
	name: 'stripe.reconcile',
	every: hour,
	run: reconcile,
})

/** The jobs the plugin adds (D-369). */
export const stripeJobs: readonly (
	Job<string, never> | RecurringJob<string>
)[] = [eventJob, syncJob, closeJob, duplicateJob, reconcileJob]
