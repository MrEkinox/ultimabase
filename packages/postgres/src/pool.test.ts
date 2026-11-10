// A connection the pool cannot give (D-335): at start the developer reads
// why; once the application serves, the client is told to come back, and
// the reason is logged.
import { createServer } from 'node:net'
import { Pool } from 'pg'
import type { Logger } from 'ultimabase'
import { PublicError } from 'ultimabase'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { pooled } from './pool.ts'

const anId: unknown = expect.any(String)
const errors: unknown[] = []
const logger: Logger = {
	info: () => undefined,
	warn: () => undefined,
	error: (bindings: unknown) => {
		errors.push(bindings)
	},
	child: () => logger,
}

// A server that takes connections and never answers.
const silent = createServer(() => undefined)
let port = 0
beforeAll(async () => {
	await new Promise<void>((listening) => {
		silent.listen(0, 'localhost', () => listening())
	})
	const address = silent.address()
	if (typeof address === 'object' && address !== null) port = address.port
})
afterAll(() => {
	silent.close()
})

function at(url: string, serving: boolean, connections = 1) {
	const pool = new Pool({
		connectionString: url,
		max: connections,
		connectionTimeoutMillis: 200,
	})
	const given = pooled(pool, {
		url,
		connections,
		wait: 200,
		logger,
		serving: () => serving,
	})
	return { pool, given }
}

describe('a connection the pool cannot give', () => {
	it('names the server at start, and is not public', async () => {
		errors.length = 0
		const { pool, given } = at('postgres://u:secret@localhost:1/x', false)
		const error: unknown = await given.connect().catch((e: unknown) => e)
		expect(error).not.toBeInstanceOf(PublicError)
		expect(error).toMatchObject({
			code: 'ECONNREFUSED',
			message:
				'Cannot reach PostgreSQL at localhost:1 (ECONNREFUSED): is it running, and is its url right?',
		})
		expect(errors).toEqual([])
		await pool.end()
	})

	it('tells a client to come back once serving, and logs why', async () => {
		errors.length = 0
		const { pool, given } = at('postgres://u:secret@localhost:1/x', true)
		const error: unknown = await given.connect().catch((e: unknown) => e)
		expect(error).toBeInstanceOf(PublicError)
		expect(error).toMatchObject({
			code: 'UNAVAILABLE',
			message: 'The database cannot be reached: try again shortly.',
			details: { retryAfter: 1 },
		})
		const cause: unknown = Reflect.get(Object(error), 'cause')
		expect(errors).toEqual([{ correlationId: anId, err: cause }])
		expect(cause).toMatchObject({
			message:
				'Cannot reach PostgreSQL at localhost:1 (ECONNREFUSED): is it running, and is its url right?',
		})
		await pool.end()
	})

	it('says the database is busy when every connection stays taken', async () => {
		errors.length = 0
		const { pool, given } = at(`postgres://u@localhost:${port}/x`, true)
		const [first, second] = await Promise.all(
			[given.connect(), given.connect()].map(async (each) =>
				each.catch((e: unknown) => e),
			),
		)
		// The first waits on a server that never answers; the second, on it.
		expect(first).toMatchObject({
			code: 'UNAVAILABLE',
			message: 'The database cannot be reached: try again shortly.',
		})
		expect(second).toMatchObject({
			code: 'UNAVAILABLE',
			message: 'The database is busy: try again shortly.',
			details: { retryAfter: 1 },
		})
		expect(errors).toHaveLength(2)
		await pool.end()
	})
})
