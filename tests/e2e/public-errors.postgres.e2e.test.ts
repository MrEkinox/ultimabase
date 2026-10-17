import { accessPlugin } from '@ultimabase/access-plugin'
import {
	PublicError,
	UltimaBase,
	provideRuntimeBehavior,
} from '@ultimabase/core'
import { graphqlPlugin } from '@ultimabase/graphql-plugin'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import {
	httpApplicationCapability,
	httpApplicationIdHeader,
	httpPlugin,
	type HttpApplication,
	type HttpOriginalHeader,
} from '@ultimabase/http-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { restPlugin } from '@ultimabase/rest-plugin'
import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../fixtures/postgres-worker-fixture.js'
import {
	anonymous,
	contributeApplication,
	plugin,
	requireCapability,
} from '@ultimabase/core/plugin'

// ADR-0305: a PublicError aborts and rolls back the operation, is never
// retried, and reaches clients; any other error stays masked and logged.
const App = UltimaBase.use(
	accessPlugin({ allowWithoutRule: { all: true } }),
	hooksPlugin(),
)

let attempts = 0
let failAfterCommit = false

const ErrorTodo = App.Schema.define({
	className: 'PublicErrorTodo',
	fields: (field) => ({ title: field.string({ required: true }) }),
}).with({
	hooks: {
		beforeOperation: {
			create: ({ item }) => {
				attempts += 1
				const { title } = item
				if (title.includes('http')) {
					throw new PublicError('A title cannot contain a link.', {
						code: 'todo.title-link',
						details: { field: 'title' },
						cause: new Error('regex detail that stays private'),
					})
				}
				if (title.includes('crash')) {
					throw new Error('database password is hunter2')
				}
			},
		},
	},
})

const postCommitPlugin = plugin({
	core: '^0.0.0',
	id: 'fixture.public-error-post-commit',
	version: '1.0.0',
	contributions: [
		provideRuntimeBehavior({
			contributionId: 'post-commit',
			create: () => ({
				value: {
					postCommit: () => {
						if (!failAfterCommit) return
						throw new PublicError('Too late to refuse.', {
							code: 'todo.after-commit',
						})
					},
				},
			}),
		}),
	],
})

const httpRequirement = requireCapability(httpApplicationCapability, '^1.0.0', {
	phase: 'setup',
})
const capture: { current?: HttpApplication } = {}
const capturePlugin = plugin({
	core: '^0.0.0',
	id: 'fixture.public-error-capture',
	version: '1.0.0',
	contributions: [
		httpRequirement,
		contributeApplication(({ capabilities }) => {
			capture.current = capabilities.get(httpRequirement)
			return { exports: undefined }
		}),
	],
})

const appId = 'public-errors'
const createApplication = (fixture: PostgresWorkerFixture) =>
	new (App.use(
		postCommitPlugin,
		restPlugin(),
		graphqlPlugin(),
		httpPlugin({ appId }),
		capturePlugin,
		postgresPlugin({ pool: fixture.pool, schemaPolicy: 'override' }),
		// Errors reach the console logger; masked failures are plugin lines (ADR-0313).
	))({ logLevel: 'error', schemas: [ErrorTodo] })

let fixture: PostgresWorkerFixture | undefined
let ultimabase: ReturnType<typeof createApplication> | undefined

const http = (): HttpApplication => {
	if (capture.current === undefined) throw new TypeError('HTTP unavailable')
	return capture.current
}
const application = () => {
	if (ultimabase === undefined) throw new TypeError('Application unavailable')
	return ultimabase
}

const postTodo = async (title: string) => {
	const headers = new Headers({
		'content-type': 'application/json',
		[httpApplicationIdHeader]: appId,
	})
	const originalHeaders: HttpOriginalHeader[] = [...headers.entries()]
	const response = await http().fetch({
		originalHeaders,
		request: new Request(
			`https://example.test/api/classes/${ErrorTodo.className}`,
			{ body: JSON.stringify({ title }), headers, method: 'POST' },
		),
	})
	return { body: await response.text(), status: response.status }
}

const createWithGraphql = (title: string) =>
	application()
		.plugin('@ultimabase/graphql-plugin')
		.execute({
			context: anonymous(application(), {
				requestId: `graphql-${title}`,
				source: 'ultimabase.graphql',
			}).context,
			document: `mutation Create($input: PublicErrorTodoCreateInput!) {
				createPublicErrorTodo(input: $input) { id title }
			}`,
			variables: { input: { title } },
		})

const countTitles = (title: string) =>
	ErrorTodo.count({ where: { title: { eq: title } } })

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({ prefix: 'public_errors' })
	ultimabase = createApplication(fixture)
	await ultimabase.start()
}, 30_000)

afterAll(async () => {
	await ultimabase?.dispose()
	await fixture?.dispose()
})

beforeEach(() => {
	attempts = 0
	failAfterCommit = false
})

describe('PublicError through transports (ADR-0305)', () => {
	it('answers REST 400 with code, message and details, and rolls back', async () => {
		const response = await postTodo('see http://spam.test')

		expect(response.status).toBe(400)
		expect(JSON.parse(response.body)).toMatchObject({
			error: {
				code: 'todo.title-link',
				details: { field: 'title' },
				message: 'A title cannot contain a link.',
				retryable: false,
			},
		})
		expect(response.body).not.toContain('regex detail')
		// Rolled back, and never retried (ADR-0300 retries conflicts only).
		await expect(countTitles('see http://spam.test')).resolves.toBe(0)
		expect(attempts).toBe(1)
	})

	it('reports the code in GraphQL extensions', async () => {
		const result = await createWithGraphql('a http link')

		expect(result.errors?.[0]?.message).toBe('A title cannot contain a link.')
		expect(result.errors?.[0]?.extensions).toMatchObject({
			code: 'todo.title-link',
			details: { field: 'title' },
		})
		await expect(countTitles('a http link')).resolves.toBe(0)
	})

	it('masks every other error and logs it with its stack', async () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
		try {
			const response = await postTodo('please crash')
			const result = await createWithGraphql('graphql crash')

			expect(response.status).toBe(500)
			expect(JSON.parse(response.body)).toMatchObject({
				error: { code: 'REST_INTERNAL_ERROR' },
			})
			expect(response.body).not.toContain('hunter2')
			expect(result.errors?.[0]?.extensions).toMatchObject({
				code: 'INTERNAL_SERVER_ERROR',
			})
			expect(JSON.stringify(result)).not.toContain('hunter2')
			const logged = log.mock.calls.map((call): unknown => call[1])
			expect(logged).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ message: 'database password is hunter2' }),
				]),
			)
			expect(
				logged.every(
					(error) => error instanceof Error && error.stack !== undefined,
				),
			).toBe(true)
		} finally {
			log.mockRestore()
		}
	})

	it('only logs a PublicError thrown after commit', async () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
		try {
			failAfterCommit = true
			const created = await ErrorTodo.createOne({
				data: { title: 'committed' },
				select: { title: true },
			})

			expect(created.title).toBe('committed')
			await expect(countTitles('committed')).resolves.toBe(1)
			expect(log).toHaveBeenCalledWith(
				expect.stringContaining('after commit'),
				expect.objectContaining({ code: 'todo.after-commit' }),
			)
		} finally {
			log.mockRestore()
		}
	})
})
