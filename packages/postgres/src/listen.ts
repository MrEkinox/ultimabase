// The connection that hears the feed's notifications (D-154): it gives the
// feed what a tick brought, and once a lost connection is back, `missed`.
import { createHash } from 'node:crypto'
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

export type Listener = { readonly stop: () => Promise<void> }

/** Milliseconds between two attempts to listen again, doubling. */
const first = 100
const most = 5000

/** Listens on `channel` until stopped; a first connection that fails throws. */
export async function listening(
	config: ClientConfig,
	channel: string,
	feed: Feed,
	logger: Logger,
): Promise<Listener> {
	let client: Client | undefined
	let stopped = false
	let timer: NodeJS.Timeout | undefined
	let heard: Changed[] = []
	const flush = (): void => {
		const changes = heard
		heard = []
		if (changes.length > 0) feed.changed(changes)
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
		try {
			await own.connect()
			await own.query(`listen "${channel.replaceAll('"', '""')}"`)
		} catch (error) {
			own.removeAllListeners('end')
			await own.end().catch(() => undefined)
			throw error
		}
		return own
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
		logger.info('The change feed listens again.')
		// What was committed while no one listened is unknown.
		feed.missed()
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
	return {
		stop: async () => {
			stopped = true
			clearTimeout(timer)
			const own = client
			client = undefined
			await own?.end()
		},
	}
}
