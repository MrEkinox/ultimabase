import { createApplication } from '@ultimabase/core'
import { Pool } from 'pg'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type {
	PostgresPool,
	PostgresPoolClient,
} from '../connection/contracts.js'
import { postgresConnectionServiceToken } from '../connection/contracts.js'
import { postgresPlugin } from './postgres-plugin.js'

/** Supplies a pg-compatible boundary so lifecycle behavior stays focused. */
class FixturePool implements PostgresPool {
	connectCalls = 0
	endCalls = 0
	releaseCalls = 0

	connect(): Promise<PostgresPoolClient> {
		this.connectCalls += 1

		return Promise.resolve({
			release: () => {
				this.releaseCalls += 1
			},
		})
	}

	end(): Promise<void> {
		this.endCalls += 1

		return Promise.resolve()
	}
}

afterEach(() => {
	vi.restoreAllMocks()
})

describe('postgresPlugin', () => {
	it('defers connection verification to lifecycle connect', async () => {
		const pool = new FixturePool()
		const application = await createApplication({
			schemas: [],
			plugins: [postgresPlugin({ pool })],
		})
		const connection = application.getService(postgresConnectionServiceToken)

		expect(application.state).toBe('ready')
		expect(connection.state).toBe('idle')
		expect(pool.connectCalls).toBe(0)

		await application.start()

		expect(connection.state).toBe('connected')
		expect(pool.connectCalls).toBe(1)
		expect(pool.releaseCalls).toBe(1)

		await application.stop()

		expect(connection.state).toBe('closed')
		expect(pool.endCalls).toBe(0)

		await application.dispose()
	})

	it('disposes a URL-owned pool without opening it during setup', async () => {
		const end = vi.spyOn(Pool.prototype, 'end').mockResolvedValue()
		const connect = vi.spyOn(Pool.prototype, 'connect')
		const application = await createApplication({
			schemas: [],
			plugins: [
				postgresPlugin({
					url: 'postgresql://fixture:private@127.0.0.1:5432/fixture',
				}),
			],
		})

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
		const application = await createApplication({
			schemas: [],
			plugins: [plugin],
		})
		const pluginExports = application.getPlugin('@ultimabase/postgres')

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

		const application = await createApplication({
			schemas: [],
			plugins: [plugin],
		})

		await application.start()
		await application.dispose()

		expect(originalPool.connectCalls).toBe(1)
		expect(replacementPool.connectCalls).toBe(0)
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
				create: () => postgresPlugin({} as never),
				message: 'postgres plugin requires exactly one of url or pool',
			},
			{
				create: () => postgresPlugin({ url: '', pool } as never),
				message: 'postgres plugin requires exactly one of url or pool',
			},
			{
				create: () => postgresPlugin({ url: '' }),
				message: 'postgres url must be a non-empty string',
			},
			{
				create: () => postgresPlugin({ pool: {} } as never),
				message: 'postgres pool must provide connect() and end()',
			},
			{
				create: () =>
					postgresPlugin({ url: 'postgresql://fixture', extra: true } as never),
				message: 'postgres plugin contains unknown key: extra',
			},
		]

		for (const invalidCase of invalidCases) {
			expect(invalidCase.create).toThrow(new TypeError(invalidCase.message))
		}
	})
})
