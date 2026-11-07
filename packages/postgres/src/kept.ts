// A test file's connections, kept from one start to the next (D-309):
// opening them, and the listener's, costs more than the test's own queries.
import type { Kysely } from 'kysely'
import type { Feed, Logger } from 'ultimabase'
import type { Listener } from './listen.ts'
import { emptied } from './scratch.ts'

/** What a start opens: the pool and, when the feed has a taker, its listener. */
export type Opened = {
	readonly db: Kysely<object>
	/** The feed's channel and listener, when it has a taker (D-154). */
	readonly channel?: string
	readonly listener?: Listener
	/** Whether no query runs and none waits for a connection. */
	readonly quiet: () => boolean
	/** The snapshot of the models the tables follow, as JSON. */
	readonly shape: string
}

/** Ends what `opened` holds. */
export async function released(opened: Opened): Promise<void> {
	await opened.listener?.stop()
	await opened.db.destroy()
}

/**
 * `kept`, its tables in `schema` emptied, when the next start follows the
 * same models with a feed as before, or without one as before; otherwise
 * nothing, `kept` released. The same models need no statement: no prepared
 * one sees its table change.
 */
export async function reused(
	kept: Opened | undefined,
	shape: string,
	schema: string,
	feed: Feed | undefined,
	logger: Logger,
): Promise<Opened | undefined> {
	if (kept === undefined) return undefined
	if (kept.shape !== shape || (feed === undefined) !== !kept.listener) {
		await released(kept)
		return undefined
	}
	await emptied(kept.db, schema, schema)
	if (feed !== undefined) await kept.listener?.resumed(feed, logger)
	return kept
}
