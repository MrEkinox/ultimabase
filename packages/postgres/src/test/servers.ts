// The servers `TEST_DATABASE_URL` lists, and the contract on one of them
// (D-98), each test in its own schema.
import { randomUUID } from 'node:crypto'
import { testAdapter } from '@ultimabase/testing'
import { Client } from 'pg'
import type { Adapter, Logger } from 'ultimabase'
import { createAdapter } from '../adapter.ts'

const servers =
	'postgres://postgres:postgres@localhost:54315/postgres postgres://postgres:postgres@localhost:54318/postgres'
export const urls = (process.env['TEST_DATABASE_URL'] ?? servers)
	.split(' ')
	.filter((url) => url !== '')

export async function run(url: string, statement: string): Promise<void> {
	const client = new Client({ connectionString: url })
	await client.connect()
	try {
		await client.query(statement)
	} finally {
		await client.end()
	}
}

/**
 * `url` on `schema`, in a session whose time zone gives old dates an offset
 * in seconds, which a date read in it loses.
 */
export function inSchema(url: string, schema: string): string {
	const separator = url.includes('?') ? '&' : '?'
	const options = `-c search_path=${schema} -c TimeZone=Europe/Paris`
	return `${url}${separator}options=${encodeURIComponent(options)}`
}

const silent: Logger = {
	info: () => undefined,
	warn: () => undefined,
	error: () => undefined,
	child: () => silent,
}

/** The adapter contract on the server at `url`. */
export function conformance(url: string): void {
	let trips = 0
	const create = (): Adapter => {
		const schema = `t_${randomUUID().replaceAll('-', '')}`
		const adapter = createAdapter({
			url: inSchema(url, schema),
			log: () => {
				trips += 1
			},
		})
		return {
			...adapter,
			start: async (given, _logger, feed) => {
				await run(url, `create schema "${schema}"`)
				await adapter.start(given, silent, feed)
			},
			stop: async () => {
				await adapter.stop()
				await run(url, `drop schema "${schema}" cascade`)
			},
		}
	}
	testAdapter(`postgres at ${new URL(url).host}`, create, {
		roundTrips: () => trips,
	})
}
