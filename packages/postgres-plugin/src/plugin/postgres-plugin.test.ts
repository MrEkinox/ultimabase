import { UltimaBase } from '@ultimabase/core'
import { Pool } from 'pg'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type {
	PostgresPool,
	PostgresPoolClient,
} from '../connection/contracts.js'
import { postgresPlugin } from './postgres-plugin.js'

/** Supplies a pg-compatible boundary so lifecycle behavior stays focused. */
class FixturePool implements PostgresPool {
	connectCalls = 0
	endCalls = 0
	releaseCalls = 0
	queryCalls = 0

	connect(): Promise<PostgresPoolClient> {
		this.connectCalls += 1

		return Promise.resolve({
			query: (): never => {
				throw new TypeError('Fixture client does not execute transactions')
			},
			release: () => {
				this.releaseCalls += 1
			},
		})
	}

	end(): Promise<void> {
		this.endCalls += 1

		return Promise.resolve()
	}

	query(queryText: string): Promise<{ readonly rows: readonly unknown[] }> {
		this.queryCalls += 1

		return Promise.resolve({
			rows: queryText.includes('current_schema')
				? [{ namespace: 'public' }]
				: [],
		})
	}
}

afterEach(() => {
	vi.restoreAllMocks()
	vi.unstubAllEnvs()
})

/** Starts one fixture application and returns its startup failure messages. */
const startupFailure = async (
	plugin: ReturnType<typeof postgresPlugin>,
	className: string,
): Promise<string> => {
	const application = new (UltimaBase.use(plugin))({
		schemas: [
			UltimaBase.Schema.define({
				className,
				fields: (field) => ({ title: field.string() }),
			}),
		],
	})
	await application.initialize()
	const failure = await application.start().then(
		() => undefined,
		(error: unknown) => error,
	)
	await application.dispose()
	const messages: string[] = []
	for (let error = failure; error instanceof Error; error = error.cause)
		messages.push(error.message)
	return messages.join(' <- ')
}

describe('postgresPlugin', () => {
	it('defers connection verification to lifecycle connect', async () => {
		const pool = new FixturePool()
		const application = new (UltimaBase.use(postgresPlugin({ pool })))({
			schemas: [],
		})
		await application.initialize()
		const connection = application.plugin(
			'@ultimabase/postgres-plugin',
		).connection

		expect(application.state).toBe('ready')
		expect(connection.state).toBe('idle')
		expect(pool.connectCalls).toBe(0)

		await application.start()

		expect(connection.state).toBe('connected')
		expect(pool.connectCalls).toBe(1)
		expect(pool.releaseCalls).toBe(1)
		expect(pool.queryCalls).toBe(4)

		await application.stop()

		expect(connection.state).toBe('closed')
		expect(pool.endCalls).toBe(0)

		await application.dispose()
	})

	it('disposes a URL-owned pool without opening it during setup', async () => {
		const end = vi.spyOn(Pool.prototype, 'end').mockResolvedValue()
		const connect = vi.spyOn(Pool.prototype, 'connect')
		const application = new (UltimaBase.use(
			postgresPlugin({
				url: 'postgresql://fixture:private@127.0.0.1:5432/fixture',
			}),
		))({
			schemas: [],
		})
		await application.initialize()

		expect(connect).not.toHaveBeenCalled()

		await application.dispose()

		expect(end).toHaveBeenCalledOnce()
	})

	it('keeps connection URLs out of public plugin metadata and exports', async () => {
		const secret = 'metadata-secret'
		const plugin = postgresPlugin({
			url: `postgresql://fixture:${secret}@127.0.0.1:5432/fixture`,
		})
		vi.spyOn(Pool.prototype, 'end').mockResolvedValue()
		const application = new (UltimaBase.use(plugin))({ schemas: [] })
		await application.initialize()
		const pluginExports = application.plugin('@ultimabase/postgres-plugin')

		expect(JSON.stringify(plugin)).not.toContain(secret)
		expect(JSON.stringify(pluginExports)).not.toContain(secret)
		expect(Object.keys(pluginExports.connection)).toStrictEqual([])

		await application.dispose()
	})

	it('captures validated options before mutable JavaScript input can change', async () => {
		const originalPool = new FixturePool()
		const replacementPool = new FixturePool()
		const mutableOptions: { pool: PostgresPool } = { pool: originalPool }
		const plugin = postgresPlugin(mutableOptions)

		mutableOptions.pool = replacementPool

		const application = new (UltimaBase.use(plugin))({ schemas: [] })
		await application.initialize()

		await application.start()
		await application.dispose()

		expect(originalPool.connectCalls).toBe(1)
		expect(replacementPool.connectCalls).toBe(0)
	})

	it('skips structural queries when schemaPolicy is ignore', async () => {
		const pool = new FixturePool()
		const application = new (UltimaBase.use(
			postgresPlugin({ pool, schemaPolicy: 'ignore' }),
		))({
			schemas: [
				UltimaBase.Schema.define({
					className: 'IgnoredArticle',
					fields: (field) => ({ title: field.string() }),
				}),
			],
		})
		await application.initialize()

		await application.start()
		await application.dispose()

		expect(pool.queryCalls).toBe(0)
	})

	// ADR-0292: an omitted policy must not alter a production database.
	it('defaults schemaPolicy to fail in production and override elsewhere', async () => {
		vi.stubEnv('NODE_ENV', 'production')
		expect(
			await startupFailure(
				postgresPlugin({ pool: new FixturePool() }),
				'ProductionArticle',
			),
		).toMatch(
			/PostgreSQL schema differs from the registered UltimaBase schemas\..*production_article/u,
		)
		// An explicit policy always wins over the environment default; `override`
		// tries to apply the change, which the fixture transaction refuses.
		expect(
			await startupFailure(
				postgresPlugin({ pool: new FixturePool(), schemaPolicy: 'override' }),
				'ExplicitArticle',
			),
		).toBe('PostgreSQL direct schema synchronization failed.')

		vi.stubEnv('NODE_ENV', 'development')
		expect(
			await startupFailure(
				postgresPlugin({ pool: new FixturePool() }),
				'DevelopmentArticle',
			),
		).toBe('PostgreSQL direct schema synchronization failed.')
	})

	it('captures schemaPolicy before caller mutation', async () => {
		const pool = new FixturePool()
		const mutableOptions: {
			pool: PostgresPool
			schemaPolicy: 'ignore' | 'override'
		} = { pool, schemaPolicy: 'ignore' }
		const plugin = postgresPlugin(mutableOptions)

		mutableOptions.schemaPolicy = 'override'

		const application = new (UltimaBase.use(plugin))({ schemas: [] })
		await application.initialize()

		await application.start()
		await application.dispose()

		expect(pool.queryCalls).toBe(0)
	})

	it('compiles the direct PostgreSQL schema option during setup', async () => {
		const Application = UltimaBase.use(
			postgresPlugin({ pool: new FixturePool() }),
		)
		const schema = Application.Schema.define({
			className: 'Article',
			fields: (field) => ({ title: field.string() }),
		}).with({ postgres: { table: 'content.Articles' } })
		const application = new Application({ schemas: [schema] })
		await application.initialize()

		expect(application.state).toBe('ready')

		await application.dispose()
	})

	it('rejects ambiguous and malformed JavaScript configuration', () => {
		const pool = new FixturePool()
		const invalidCases: readonly {
			readonly create: () => unknown
			readonly message: string
		}[] = [
			{
				create: () => postgresPlugin(null as never),
				message: 'postgres plugin options must be a plain object',
			},
			{
				create: () => postgresPlugin({ url: '', pool } as never),
				message: 'postgres plugin accepts at most one of url or pool',
			},
			{
				create: () => postgresPlugin({ url: '' }),
				message: 'postgres url must be a non-empty string',
			},
			{
				create: () => postgresPlugin({ pool: {} } as never),
				message: 'postgres pool must provide connect(), end(), and query()',
			},
			{
				create: () =>
					postgresPlugin({ url: 'postgresql://fixture', extra: true } as never),
				message: 'postgres plugin contains unknown key: extra',
			},
			{
				create: () => postgresPlugin({ pool, schemaPolicy: 'unsafe' } as never),
				message: 'postgres schemaPolicy must be override, fail, or ignore',
			},
		]

		for (const invalidCase of invalidCases) {
			expect(invalidCase.create).toThrow(new TypeError(invalidCase.message))
		}
	})
})
