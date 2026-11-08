// The connection that hears the feed's notifications (D-154): it gives the
// feed what a tick brought, and once a lost connection is back, `missed`. It
// also asks the database, as a network can fail with no one told (D-287).
import { createHash } from 'node:crypto'
import { setImmediate as turn, setTimeout as after } from 'node:timers/promises'
import type { ClientConfig } from 'pg'
import { Client } from 'pg'
import type { Changed, Feed, Logger } from 'ultimabase'
import { changedOf } from './notify.ts'

/** The feed's channel of `schema`, within the 63 bytes of a name. */
export function channelOf(schema: string): string {
	const channel = `ultimabase:${schema}`
	if (Buffer.byteLength(channel) <= 63) return channel
	const hash = createHash('sha256').update(schema).digest('hex')
	return `ultimabase:${hash.slice(0, 52)}`
}

export type Listener = {
	readonly stop: () => Promise<void>
	/** Gives the feed nothing until `resumed` (D-309). */
	readonly paused: () => void
	/**
	 * Drops what was committed before, then gives `feed` what comes: the
	 * server sends a notification before the answer to a later query.
	 */
	readonly resumed: (feed: Feed, logger: Logger) => Promise<void>
}

/** Milliseconds between two attempts to listen again, doubling. */
const first = 100
const most = 5000

/** How often the database is asked, and how long it has to answer, in ms. */
export const pulse = { every: 10_000, silence: 10_000 }

/** Fails all a connection holds, as a network that says so would: at once. */
export function severed(client: Client): void {
	client.connection.stream.destroy(new Error('PostgreSQL stopped answering.'))
}

/**
 * False once `silence` is over, after the sockets were read: a long turn of
 * the event loop would otherwise pass for the database's silence.
 */
async function silent(silence: number): Promise<false> {
	await after(silence, undefined, { ref: false })
	await turn()
	return false
}

/**
 * Listens on `channel` until stopped; a first connection that fails throws.
 * When the database stays silent, `suspects` are given up with this listener.
 */
export async function listening(
	config: ClientConfig,
	channel: string,
	given: Feed,
	told: Logger,
	suspects: () => readonly Client[],
): Promise<Listener> {
	let logger = told
	let client: Client | undefined
	let stopped = false
	let timer: NodeJS.Timeout | undefined
	let heard: Changed[] = []
	let feed: Feed | undefined = given
	const listen = `listen "${channel.replaceAll('"', '""')}"`
	const flush = (): void => {
		const changes = heard
		heard = []
		if (changes.length > 0) feed?.changed(changes)
	}
	const connect = async (): Promise<Client> => {
		const own = new Client({ ...config, application_name: 'ultimabase-feed' })
		own.on('notification', ({ channel: to, payload }) => {
			const change = to === channel ? changedOf(payload) : undefined
			if (change === undefined) return
			if (heard.length === 0) setImmediate(flush)
			heard.push(change)
		})
		own.on('error', () => lost(own))
		own.on('end', () => lost(own))
		const deadline = setTimeout(() => severed(own), pulse.silence)
		try {
			await own.connect()
			await own.query(listen)
		} catch (error) {
			own.removeAllListeners('end')
			await own.end().catch(() => undefined)
			throw error
		} finally {
			clearTimeout(deadline)
		}
		return own
	}
	const beat = (own: Client): void => {
		setTimeout(() => void ask(own), pulse.every).unref()
	}
	const ask = async (own: Client): Promise<void> => {
		if (client !== own) return
		// A connection opened during the silence is not in doubt.
		const doubted = suspects()
		const answer = own.query('select 1').then(
			() => true,
			() => true,
		)
		if (await Promise.race([answer, silent(pulse.silence)])) {
			beat(own)
			return
		}
		if (client !== own) return
		logger.warn(
			`PostgreSQL did not answer for ${pulse.silence / 1000}s: its connections are given up.`,
		)
		for (const each of [own, ...doubted]) severed(each)
	}
	const retry = (wait: number): void => {
		timer = setTimeout(() => void again(wait), wait)
	}
	const again = async (wait: number): Promise<void> => {
		let own: Client
		try {
			own = await connect()
		} catch {
			retry(Math.min(wait * 2, most))
			return
		}
		if (stopped) {
			await own.end().catch(() => undefined)
			return
		}
		client = own
		beat(own)
		logger.info('The change feed listens again.')
		// What was committed while no one listened is unknown.
		feed?.missed()
	}
	const lost = (own: Client): void => {
		if (stopped || client !== own) return
		client = undefined
		own.removeAllListeners('end')
		own.end().catch(() => undefined)
		logger.warn('The change feed lost its connection: it listens again soon.')
		retry(first)
	}
	client = await connect()
	beat(client)
	return {
		stop: async () => {
			stopped = true
			clearTimeout(timer)
			const own = client
			client = undefined
			await own?.end()
		},
		paused: () => {
			feed = undefined
		},
		resumed: async (next, nextLogger) => {
			// Listening again is the round trip, and changes nothing.
			await client?.query(listen).catch(() => undefined)
			// What it heard reaches the feed a turn later: nowhere.
			await turn()
			feed = next
			logger = nextLogger
		},
	}
}
