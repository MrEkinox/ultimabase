import {
	PostgreSqlContainer,
	type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql'
import { createApplication } from '@ultimabase/core'
import {
	postgresConnectionServiceToken,
	postgresPlugin,
} from '@ultimabase/postgres'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

let container: StartedPostgreSqlContainer | undefined

const getContainer = (): StartedPostgreSqlContainer => {
	if (container === undefined) {
		throw new TypeError('PostgreSQL Testcontainer has not started')
	}

	return container
}

// One container is shared only inside this sequential connection contract suite.
beforeAll(async () => {
	container = await new PostgreSqlContainer('postgres:17-alpine').start()
}, 120_000)

afterAll(async () => {
	await container?.stop()
})

describe('PostgreSQL connection lifecycle', { concurrent: false }, () => {
	it('connects and disposes an application-owned URL pool', async () => {
		const application = await createApplication({
			schemas: [],
			plugins: [postgresPlugin({ url: getContainer().getConnectionUri() })],
		})
		const connection = application.getService(postgresConnectionServiceToken)

		try {
			expect(connection.state).toBe('idle')

			await application.start()

			expect(connection.state).toBe('connected')
		} finally {
			await application.dispose()
		}

		expect(connection.state).toBe('closed')
	})

	it('verifies but does not dispose an existing developer-owned pool', async () => {
		const pool = new Pool({
			connectionString: getContainer().getConnectionUri(),
		})
		const application = await createApplication({
			schemas: [],
			plugins: [postgresPlugin({ pool })],
		})

		try {
			await application.start()
			await application.dispose()

			// A successful query proves application disposal did not end the injected pool.
			const result = await pool.query<{ readonly value: number }>(
				'SELECT 1::integer AS value',
			)

			expect(result.rows).toStrictEqual([{ value: 1 }])
		} finally {
			await application.dispose()
			await pool.end()
		}
	})

	it('fails startup without leaking credentials through the error boundary', async () => {
		const secret = 'testcontainers-never-leak'
		const url = `postgresql://fixture:${secret}@127.0.0.1:1/fixture?connect_timeout=1`
		const plugin = postgresPlugin({ url })
		const application = await createApplication({
			schemas: [],
			plugins: [plugin],
		})
		let failure: unknown

		try {
			try {
				await application.start()
			} catch (error: unknown) {
				failure = error
			}

			expect(failure).toMatchObject({
				code: 'INTERNAL_ERROR',
				message: 'PostgreSQL connection verification failed.',
				cause: undefined,
			})
			expect(String(failure)).not.toContain(secret)
			expect(JSON.stringify(failure)).not.toContain(secret)
			expect(JSON.stringify(plugin)).not.toContain(secret)
			expect(application.state).toBe('disposed')
		} finally {
			await application.dispose()
		}
	})
})
