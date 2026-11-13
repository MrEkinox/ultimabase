// The plugin's jobs (D-371 point 5), named `stripe.*`: an event's sync, a
// customer's sync and close, and the hourly reconciliation, which catches
// what a lost webhook or a failed job left behind.
import type { Job, RecurringJob, StandardSchema } from '@ultimabase/jobs'
import { defineJob } from '@ultimabase/jobs'
import type { Customer } from './customer.ts'
import { locked } from './customer.ts'
import { M, StripeCustomer, StripeEvent } from './models.ts'
import type { Rows, Running } from './running.ts'
import { runningOf, stripeOf } from './running.ts'
import { syncCustomer } from './sync.ts'

const hour = 60 * 60 * 1000
/** A customer not synced for a day is synced again. */
const resyncAfter = 24 * hour
/**
 * How long a processed event stays: longer than Stripe retries a delivery
 * (3 days), so a late one is still stored once.
 */
const keepEvents = 90 * 24 * hour
/** The customers the reconciliation reads at once. */
const page = 500

/** A job's input: an object of the strings `keys` names. */
function strings<const K extends string>(
	...keys: K[]
): StandardSchema<{ readonly [P in K]: string }> {
	const message = `An object of strings: ${keys.join(', ')}.`
	return {
		'~standard': {
			version: 1,
			vendor: 'ultimabase-stripe',
			validate: (value: unknown) => {
				const read: Record<string, string> = {}
				for (const key of keys) {
					const field: unknown = Reflect.get(Object(value), key)
					if (typeof field !== 'string') return { issues: [{ message }] }
					read[key] = field
				}
				return { value: read }
			},
		},
	}
}

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

/** Whether the customer needs a sync: past a change, or not synced lately. */
const stale = (row: Customer, now: number): boolean =>
	row.stripeId !== null &&
	(row.syncedAt === null ||
		row.syncedAt.getTime() < now - resyncAfter ||
		(row.renewsAt !== null && row.renewsAt.getTime() <= now))

/**
 * Every hour: syncs the customers past a change or not synced for a day,
 * closes those of deleted payers, enqueues the events still waiting, and
 * deletes the old processed ones.
 */
async function reconcile(): Promise<void> {
	const running = runningOf('stripe.reconcile')
	if (running.stripe === undefined) return
	const now = Date.now()
	// A row a close deletes meanwhile shifts the pages: the next hour sees
	// what this one skipped.
	for (let skip = 0; ; skip += page) {
		const rows = await StripeCustomer.findMany(
			{ orderBy: { id: 'asc' }, skip, take: page },
			M,
		)
		if (rows.length === 0) break
		const gone = await goneOf(running, rows)
		for (const row of rows) {
			if (gone.has(row.id)) {
				await closeJob.enqueue({ model: row.model, payer: row.payer })
			} else if (stale(row, now)) {
				await syncJob.enqueue({ customer: row.id })
			}
		}
	}
	const waiting = await StripeEvent.findMany(
		{ where: { processedAt: null }, select: { id: true } },
		M,
	)
	for (const { id } of waiting) await eventJob.enqueue({ event: id })
	const old = new Date(now - keepEvents)
	await StripeEvent.deleteMany({ where: { processedAt: { lt: old } } }, M)
}

const reconcileJob: RecurringJob<'stripe.reconcile'> = defineJob({
	name: 'stripe.reconcile',
	every: hour,
	run: reconcile,
})

/** The jobs the plugin adds (D-369). */
export const stripeJobs: readonly (
	Job<string, never> | RecurringJob<string>
)[] = [eventJob, syncJob, closeJob, reconcileJob]
