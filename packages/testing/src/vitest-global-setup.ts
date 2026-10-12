import process from 'node:process'

import { PostgreSqlContainer } from '@testcontainers/postgresql'

import { testPostgresImage } from './application/test-database.js'

/**
 * Starts one PostgreSQL container for the whole run unless
 * `TEST_DATABASE_URL` is set; workers inherit the variable.
 */
const setupTestDatabase = async (): Promise<
	(() => Promise<void>) | undefined
> => {
	const url = process.env.TEST_DATABASE_URL
	if (url !== undefined && url.trim() !== '') return undefined
	const container = await new PostgreSqlContainer(testPostgresImage).start()
	process.env.TEST_DATABASE_URL = container.getConnectionUri()
	return async () => {
		delete process.env.TEST_DATABASE_URL
		await container.stop()
	}
}

export default setupTestDatabase
