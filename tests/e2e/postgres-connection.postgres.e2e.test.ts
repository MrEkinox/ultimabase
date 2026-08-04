import { createApplication } from '@ultimabase/core'
import {
	postgresConnectionServiceToken,
	postgresPlugin,
} from '@ultimabase/postgres-plugin'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from './postgres-worker-fixture.js'

let fixture: PostgresWorkerFixture | undefined

const getFixture = (): PostgresWorkerFixture => {
	if (fixture === undefined) {
		throw new TypeError('PostgreSQL worker fixture has not started')
	}

	return fixture
}

// Every E2E file receives a reset namespace while the global setup shares its container.
beforeAll(async () => {
	fixture = await createPostgresWorkerFixture()
}, 30_000)

afterAll(async () => {
	await fixture?.dispose()
})

describe('PostgreSQL connection lifecycle', { concurrent: false }, () => {
	it('connects and disposes an application-owned URL pool', async () => {
		const application = await createApplication({
			schemas: [],
			plugins: [postgresPlugin({ url: getFixture().connectionUri })],
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
		const pool = getFixture().pool
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
