// A statement's deadline (D-331): PostgreSQL ends one that runs past
// `statementTimeout`, so a connection that has heard nothing for longer is
// silent, and is cut as D-287 cuts them, with or without realtime.
import { setImmediate as turn } from 'node:timers/promises'
import type { Client } from 'pg'
import type { Logger } from 'ultimabase'
import { Refused } from 'ultimabase'
import { severed } from './listen.ts'

/** What the network may add to a statement's timeout, in ms. */
export const grace = { after: 10_000 }

/** PostgreSQL's bound, and Node's for a timer. */
const most = 2_147_483_647

/** `statementTimeout`, checked at start. */
export function timeoutOf(given: number | undefined): number | undefined {
	if (given === undefined) return undefined
	if (Number.isInteger(given) && given >= 1 && given <= most) return given
	throw new Refused(
		`postgres() takes statementTimeout as a whole number of milliseconds, from 1 to ${most}, not ${given}.`,
	)
}

/**
 * Cuts `client` once a statement it sent has had no answer for `timeout`
 * and the grace: each answer moves the deadline on, as the next statement
 * starts then. Judged a turn after it, the sockets read, as in D-287, and
 * never while `spared()`, a migration running.
 */
export function watched(
	client: Client,
	timeout: number,
	spared: () => boolean,
	logger: Logger,
): void {
	const query = client.query.bind(client)
	const limit = Math.min(timeout + grace.after, most)
	let running = 0
	/** Moves on at each statement's start and answer. */
	let moves = 0
	const check = async (): Promise<void> => {
		if (running === 0) return
		const seen = moves
		await turn()
		if (running === 0 || moves !== seen) return
		if (spared()) {
			deadline.refresh()
			return
		}
		logger.warn(
			`PostgreSQL did not answer a statement for ${limit / 1000}s: its connection is given up.`,
		)
		severed(client)
	}
	const deadline = setTimeout(() => void check(), limit).unref()
	const settled = (): void => {
		running -= 1
		moves += 1
		deadline.refresh()
	}
	Reflect.set(client, 'query', (...given: unknown[]): unknown => {
		const result: unknown = Reflect.apply(query, undefined, given)
		// A cursor or a callback is not the adapter's: it is left alone.
		if (!(result instanceof Promise)) return result
		if (running === 0) {
			moves += 1
			deadline.refresh()
		}
		running += 1
		result.then(settled, settled)
		return result
	})
}
