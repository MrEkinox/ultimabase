import { UltimaBase, type Logger } from '@ultimabase/core'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { postgresPlugin } from './postgres-plugin.js'

afterEach(() => {
	vi.unstubAllEnvs()
})

const secretUrl = 'postgresql://reader:hunter2@127.0.0.1:1/never_connected'

const debugLines = () => {
	const lines: string[] = []
	const logger: Logger = {
		debug: (message) => {
			lines.push(message)
		},
		error: () => undefined,
		info: () => undefined,
		warn: () => undefined,
	}
	return { lines, logger }
}

/** Materializes the connection (no network call) and returns the debug lines. */
const initialize = async (
	plugin: ReturnType<typeof postgresPlugin>,
): Promise<readonly string[]> => {
	const { lines, logger } = debugLines()
	const application = new (UltimaBase.use(plugin))({
		logLevel: 'debug',
		logger,
		schemas: [],
	})
	try {
		await application.initialize()
	} finally {
		await application.dispose()
	}
	return lines.filter((line) =>
		line.startsWith('[@ultimabase/postgres-plugin]'),
	)
}

// ADR-0312 decision 3: `postgresPlugin()` reads DATABASE_URL at start.
describe('postgresPlugin() without url or pool', () => {
	it('reads DATABASE_URL when the application starts, not in the factory', async () => {
		vi.stubEnv('DATABASE_URL', undefined)
		const plugin = postgresPlugin()
		vi.stubEnv('DATABASE_URL', secretUrl)

		const lines = await initialize(plugin)

		expect(lines).toContain(
			'[@ultimabase/postgres-plugin] connection from DATABASE_URL',
		)
		expect(lines.join('\n')).not.toContain('hunter2')
	})

	it.each([undefined, '', '   '])(
		'fails start with a message naming DATABASE_URL and url when it is %j',
		async (value) => {
			vi.stubEnv('DATABASE_URL', value)
			const application = new (UltimaBase.use(postgresPlugin()))({
				logger: false,
				schemas: [],
			})

			await expect(application.start()).rejects.toThrow(
				'PostgreSQL has no connection: set the DATABASE_URL environment variable, or pass postgresPlugin({ url }) or postgresPlugin({ pool }).',
			)
		},
	)

	it('lets an explicit url win over DATABASE_URL', async () => {
		vi.stubEnv('DATABASE_URL', '')

		await expect(
			initialize(postgresPlugin({ url: secretUrl })),
		).resolves.toContain(
			'[@ultimabase/postgres-plugin] connection from the url option',
		)
	})
})

// ADR-0312 decision 2: schemaPolicy through the shared plugin-kit rule.
describe('postgres schemaPolicy default', () => {
	it.each([
		['production', 'schemaPolicy fail (NODE_ENV is production)'],
		['development', 'schemaPolicy override (NODE_ENV is not production)'],
		['staging', 'schemaPolicy override (NODE_ENV is not production)'],
		[undefined, 'schemaPolicy override (NODE_ENV is not production)'],
	])(
		'derives it from NODE_ENV %j at factory time',
		async (environment, line) => {
			vi.stubEnv('NODE_ENV', environment)
			const plugin = postgresPlugin({ url: secretUrl })
			vi.stubEnv('NODE_ENV', 'production')

			await expect(initialize(plugin)).resolves.toContain(
				`[@ultimabase/postgres-plugin] ${line}`,
			)
		},
	)

	it('lets an explicit policy win and logs its source', async () => {
		vi.stubEnv('NODE_ENV', 'production')

		await expect(
			initialize(postgresPlugin({ schemaPolicy: 'ignore', url: secretUrl })),
		).resolves.toContain(
			'[@ultimabase/postgres-plugin] schemaPolicy ignore (explicit option)',
		)
	})
})
