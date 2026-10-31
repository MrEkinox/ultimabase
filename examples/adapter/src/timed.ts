// `timed(adapter)`: an adapter that runs another. It counts its calls, each a
// round trip to the database, and logs a warning, through the kernel's
// logger, for each call that takes `slow` milliseconds or more.
//#region types
import type {
	Adapter,
	BeginOptions,
	Logger,
	Transaction,
	Write,
} from 'ultimabase'

export type TimedOptions = {
	/** Milliseconds from which a call is logged; 100 by default. */
	readonly slow?: number
}

/** An adapter, and how many round trips it has made. */
export type Timed = Adapter & { readonly roundTrips: () => number }

/** The models a write changes: `Post, Author`. */
const modelsOf = (write: Write) =>
	[...new Set(write.changes.map((change) => change.model))].join(', ')
//#endregion

export function timed(adapter: Adapter, options: TimedOptions = {}): Timed {
	const slow = options.slow ?? 100
	let logger: Logger | undefined
	let trips = 0

	//#region trip
	/** `run` as one round trip, logged under `label` when it is slow. */
	const trip =
		<A extends unknown[], R>(
			label: (...given: A) => string,
			run: (...given: A) => Promise<R>,
		) =>
		async (...given: A): Promise<R> => {
			trips += 1
			const started = performance.now()
			try {
				return await run(...given)
			} finally {
				const took = Math.round(performance.now() - started)
				if (took >= slow) logger?.warn(`${label(...given)} took ${took} ms.`)
			}
		}
	//#endregion

	//#region transaction
	/** A transaction's calls, each a round trip, its commit included. */
	const timedTransaction = (tx: Transaction): Transaction => ({
		find: trip(
			(read) => `find ${read.model}`,
			async (read) => tx.find(read),
		),
		count: trip(
			(read) => `count ${read.model}`,
			async (read) => tx.count(read),
		),
		aggregate: trip(
			(read) => `aggregate ${read.model}`,
			async (read) => tx.aggregate(read),
		),
		write: trip(
			(write) => `write ${modelsOf(write)}`,
			async (write) => tx.write(write),
		),
		commit: trip(
			() => 'commit',
			async () => tx.commit(),
		),
		rollback: trip(
			() => 'rollback',
			async () => tx.rollback(),
		),
	})
	//#endregion

	return {
		//#region start
		// The kernel's logger and the change feed: pass them on.
		start: async (schema, kernelLogger, feed) => {
			logger = kernelLogger
			await adapter.start(schema, kernelLogger, feed)
		},
		stop: async () => adapter.stop(),
		//#endregion
		//#region reads
		find: trip(
			(read) => `find ${read.model}`,
			async (read) => adapter.find(read),
		),
		count: trip(
			(read) => `count ${read.model}`,
			async (read) => adapter.count(read),
		),
		aggregate: trip(
			(read) => `aggregate ${read.model}`,
			async (read) => adapter.aggregate(read),
		),
		//#endregion
		//#region write
		write: trip(
			(write) => `write ${modelsOf(write)}`,
			async (write) => adapter.write(write),
		),
		//#endregion
		//#region begin
		begin: trip<[BeginOptions?], Transaction>(
			() => 'begin',
			async (asked) => timedTransaction(await adapter.begin(asked)),
		),
		//#endregion
		//#region migrations
		// memory() has none; PostgreSQL's sync and deploy go through as they are.
		...(adapter.migrations !== undefined && {
			migrations: adapter.migrations,
		}),
		//#endregion
		roundTrips: () => trips,
	}
}
