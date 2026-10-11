import net from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'

import { UltimaBase, type Logger } from '@ultimabase/core'
import {
	postgresPlugin,
	type PostgresPluginOptions,
} from '@ultimabase/postgres-plugin'
import { createCapturingLogger } from '@ultimabase/testing'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../../../../tests/fixtures/postgres-worker-fixture.js'

let fixture: PostgresWorkerFixture | undefined

const getFixture = (): PostgresWorkerFixture => {
	if (fixture === undefined) {
		throw new TypeError(
			'PostgreSQL connection-settings fixture has not started',
		)
	}

	return fixture
}

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({ prefix: 'connection_settings' })
	// Every insert into this table sleeps, so statements can be slow on purpose.
	await fixture.pool.query(
		`CREATE FUNCTION settings_slow_insert() RETURNS trigger LANGUAGE plpgsql
		 AS $$ BEGIN PERFORM pg_sleep(0.6); RETURN NEW; END $$`,
	)
}, 30_000)

afterAll(async () => {
	await fixture?.dispose()
})

const prefix = '[@ultimabase/postgres-plugin] '

/** The worker URL with one extra connection parameter. */
const withParameter = (name: string, value: string): string => {
	const url = new URL(getFixture().connectionUri)
	url.searchParams.set(name, value)
	return url.toString()
}

/** A fresh application declaring the slow table of one test. */
const createSlowApplication = (
	options: PostgresPluginOptions,
	table: string,
	logger: Logger | false = false,
) => {
	const App = UltimaBase.use(postgresPlugin(options))
	const Post = App.Schema.define({
		className: 'SettingsSlowPost',
		fields: (field) => ({ title: field.string({ required: true }) }),
	}).with({ postgres: { table } })
	return { Post, application: new App({ logger, schemas: [Post] }) }
}

const addSlowTrigger = async (table: string): Promise<void> => {
	await getFixture().pool.query(
		`CREATE TRIGGER ${table}_slow BEFORE INSERT ON ${table}
		 FOR EACH ROW EXECUTE FUNCTION settings_slow_insert()`,
	)
}

const countConnections = async (applicationName: string): Promise<number> => {
	const { rows } = await getFixture().pool.query<{ readonly count: string }>(
		'SELECT count(*) AS count FROM pg_stat_activity WHERE application_name = $1',
		[applicationName],
	)
	return Number(rows[0]?.count ?? 0)
}

const listen = async (server: net.Server, port = 0): Promise<number> => {
	await new Promise<void>((resolve) => {
		server.listen(port, '127.0.0.1', resolve)
	})
	const address = server.address()
	if (address === null || typeof address === 'string') {
		throw new TypeError('TCP server has no port')
	}
	return address.port
}

const close = (server: net.Server): Promise<void> =>
	new Promise((resolve) => {
		server.close(() => {
			resolve()
		})
	})

describe(
	'PostgreSQL connection settings (ADR-0320)',
	{ concurrent: false },
	() => {
		it('retries the first connection until a late database answers', async () => {
			// Reserve a port where nothing listens yet.
			const placeholder = net.createServer()
			const port = await listen(placeholder)
			await close(placeholder)
			const target = new URL(getFixture().connectionUri)
			const url = new URL(target)
			url.hostname = '127.0.0.1'
			url.port = String(port)
			const sockets = new Set<net.Socket>()
			const proxy = net.createServer((socket) => {
				const upstream = net.connect(Number(target.port), target.hostname)
				sockets.add(socket).add(upstream)
				socket.pipe(upstream).pipe(socket)
				socket.on('error', () => upstream.destroy())
				upstream.on('error', () => socket.destroy())
			})
			const logger = createCapturingLogger()
			const App = UltimaBase.use(
				postgresPlugin({
					connection: { connectRetries: 3 },
					schemaPolicy: 'ignore',
					url: url.toString(),
				}),
			)
			const application = new App({ logger, schemas: [] })

			try {
				const starting = application.start()
				// The database "starts" only after the first attempt failed.
				await vi.waitFor(
					() => {
						expect(logger.messages('warn')).not.toStrictEqual([])
					},
					{ timeout: 5000 },
				)
				await listen(proxy, port)
				await starting

				expect(
					application.plugin('@ultimabase/postgres-plugin').connection.state,
				).toBe('connected')
				expect(logger.messages('warn')[0]).toBe(
					`${prefix}connection attempt 1 of 4 failed [ECONNREFUSED]; retrying in 500 ms.`,
				)
			} finally {
				await application.dispose()
				for (const socket of sockets) socket.destroy()
				await close(proxy)
			}
		})

		it('cancels statements over statementTimeoutMs', async () => {
			const { Post, application } = createSlowApplication(
				{
					connection: { statementTimeoutMs: 200 },
					schemaPolicy: 'override',
					url: getFixture().connectionUri,
				},
				'settings_timeout_posts',
			)
			await application.start()

			try {
				await addSlowTrigger('settings_timeout_posts')
				await expect(
					Post.createOne({ data: { title: 'too slow' } }),
				).rejects.toMatchObject({
					internalDetails: { driverCode: '57014' },
				})
			} finally {
				await application.dispose()
			}
		})

		it('limits the pool to max connections and closes idle ones after idleTimeoutMs', async () => {
			const applicationName = 'ub_settings_pool'
			const { Post, application } = createSlowApplication(
				{
					connection: { idleTimeoutMs: 200, max: 2 },
					schemaPolicy: 'override',
					url: withParameter('application_name', applicationName),
				},
				'settings_pool_posts',
			)
			await application.start()

			try {
				await addSlowTrigger('settings_pool_posts')
				const started = performance.now()
				const writes = Promise.all(
					['a', 'b', 'c', 'd', 'e'].map((title) =>
						Post.createOne({ data: { title } }),
					),
				)
				let peak = 0
				for (let sample = 0; sample < 6; sample += 1) {
					await delay(150)
					peak = Math.max(peak, await countConnections(applicationName))
				}
				await writes

				// Five 0.6 s inserts on two connections need three rounds.
				expect(performance.now() - started).toBeGreaterThanOrEqual(1700)
				expect(peak).toBeGreaterThan(0)
				expect(peak).toBeLessThanOrEqual(2)
				// The driver default would keep idle connections for 10 s.
				await vi.waitFor(
					async () => {
						expect(await countConnections(applicationName)).toBe(0)
					},
					{ interval: 100, timeout: 3000 },
				)
			} finally {
				await application.dispose()
			}
		})

		it('requires TLS when ssl is true', async () => {
			const App = UltimaBase.use(
				postgresPlugin({
					connection: { ssl: true },
					schemaPolicy: 'ignore',
					url: getFixture().connectionUri,
				}),
			)
			const application = new App({ logger: false, schemas: [] })

			// The test database accepts plain connections only.
			await expect(application.start()).rejects.toMatchObject({
				code: 'INTERNAL_ERROR',
				message: 'PostgreSQL connection verification failed.',
			})
			await application.dispose()
		})
	},
)

describe('PostgreSQL query logs (ADR-0320)', { concurrent: false }, () => {
	it('logs statements and durations without values', async () => {
		const logger = createCapturingLogger()
		const App = UltimaBase.use(
			postgresPlugin({
				debug: { logQueries: true },
				pool: getFixture().pool,
				schemaPolicy: 'override',
			}),
		)
		const Post = App.Schema.define({
			className: 'SettingsLoggedPost',
			fields: (field) => ({ title: field.string({ required: true }) }),
		}).with({ postgres: { table: 'settings_logged_posts' } })
		const application = new App({ logger, schemas: [Post] })
		await application.start()

		try {
			const secret = 'secret-title-value'
			await Post.createOne({ data: { title: secret } })
			await Post.findMany({ where: { title: { eq: secret } } })
			const queries = logger
				.messages('info')
				.filter((message) => message.startsWith(`${prefix}query `))

			expect(
				queries.some((message) =>
					/^\[@ultimabase\/postgres-plugin\] query \d+\.\d ms: insert into "settings_logged_posts" .*\$1/u.test(
						message,
					),
				),
			).toBe(true)
			expect(
				queries.some((message) =>
					message.includes('from "settings_logged_posts"'),
				),
			).toBe(true)
			expect(
				logger.lines.map(({ message }) => message).join('\n'),
			).not.toContain(secret)
		} finally {
			await application.dispose()
		}
	})

	it('logs only slow statements at warn with slowQueryMs', async () => {
		const logger = createCapturingLogger()
		const { Post, application } = createSlowApplication(
			{
				debug: { slowQueryMs: 300 },
				pool: getFixture().pool,
				schemaPolicy: 'override',
			},
			'settings_slow_posts',
			logger,
		)
		await application.start()

		try {
			await addSlowTrigger('settings_slow_posts')
			const secret = 'slow-secret-value'
			await Post.createOne({ data: { title: secret } })

			const slow = logger.messages('warn')
			expect(slow).toHaveLength(1)
			expect(slow[0]).toMatch(
				/^\[@ultimabase\/postgres-plugin\] slow query \(over 300 ms\) \d+\.\d ms: insert into "settings_slow_posts" /u,
			)
			expect(slow[0]).not.toContain(secret)
			expect(
				logger
					.messages('info')
					.filter((message) => message.includes(' query ')),
			).toStrictEqual([])
		} finally {
			await application.dispose()
		}
	})
})
