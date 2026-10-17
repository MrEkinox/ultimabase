import { accessPlugin } from '@ultimabase/access-plugin'
import { MasterAuthority, UltimaBase } from '@ultimabase/core'
import { graphqlPlugin } from '@ultimabase/graphql-plugin'
import {
	httpApplicationCapability,
	httpApplicationIdHeader,
	httpPlugin,
	type HttpApplication,
	type HttpOriginalHeader,
} from '@ultimabase/http-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { restPlugin } from '@ultimabase/rest-plugin'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../fixtures/postgres-worker-fixture.js'
import { RecordingPostgresPool } from '../fixtures/recording-postgres-pool.js'
import {
	anonymous,
	contributeApplication,
	plugin,
	requireCapability,
} from '@ultimabase/core/plugin'

// ADR-0325: reads with `include` issue one SQL statement whatever the
// transport, and `resolveMany` runs once per parent, not once per row.
const labelCalls: number[] = []

const App = UltimaBase.use(
	accessPlugin({ allowWithoutRule: { all: true } }),
	graphqlPlugin(),
)

const Author = App.Schema.define({
	className: 'CountAuthor',
	fields: (field) => ({
		name: field.string({ required: true }),
		posts: field.relation({ mappedBy: 'author', target: 'CountPost' }),
	}),
})

const Post = App.Schema.define({
	className: 'CountPost',
	fields: (field) => ({
		author: field.pointer({ target: 'CountAuthor' }),
		tags: field.relation({ target: 'CountTag' }),
		title: field.string({ required: true }),
	}),
}).with({ graphql: { count: true } })

const Tag = App.Schema.define({
	className: 'CountTag',
	fields: (field) => ({
		name: field.string({ required: true }),
		label: field.virtual({
			output: (output) => output.string(),
			select: { name: true },
			resolveMany: ({ items }) => {
				labelCalls.push(items.length)
				return items.map((item) => `#${String(item.name)}`)
			},
		}),
	}),
})

const httpRequirement = requireCapability(httpApplicationCapability, '^1.0.0', {
	phase: 'setup',
})
const capture: { current?: HttpApplication } = {}
const capturePlugin = plugin({
	core: '^0.0.0',
	id: 'fixture.include-query-count-capture',
	version: '1.0.0',
	contributions: [
		httpRequirement,
		contributeApplication(({ capabilities }) => {
			capture.current = capabilities.get(httpRequirement)
			return { exports: undefined }
		}),
	],
})

const appId = 'include-query-count'
const createApplication = (pool: RecordingPostgresPool) =>
	new (App.use(
		restPlugin(),
		httpPlugin({ appId }),
		capturePlugin,
		postgresPlugin({ pool, schemaPolicy: 'override' }),
	))({
		masterAuthority: new MasterAuthority({
			keys: [{ id: 'count', value: 'include-query-count-secret' }],
			onUse: () => undefined,
		}),
		logger: false,
		schemas: [Author, Post, Tag],
	})

let fixture: PostgresWorkerFixture | undefined
let recorder: RecordingPostgresPool | undefined
let ultimabase: ReturnType<typeof createApplication> | undefined

const pool = (): RecordingPostgresPool => {
	if (recorder === undefined) throw new TypeError('Recorder unavailable')
	return recorder
}

/** Every statement since the last reset, transaction control excluded. */
const statements = (): readonly string[] =>
	pool().statements.filter(
		(text) => !/^\s*(begin|commit|rollback)\b/iu.test(text),
	)

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({ prefix: 'include_count' })
	recorder = new RecordingPostgresPool(fixture.pool)
	ultimabase = createApplication(recorder)
	await ultimabase.start()
	const master = { useMasterKey: true } as const
	const tags = await Tag.createMany(
		{ data: [{ name: 'a' }, { name: 'b' }, { name: 'c' }] },
		master,
	)
	const [first, ...others] = tags.map(({ id }) => id)
	if (first === undefined) throw new TypeError('Expected tags')
	for (const name of ['ada', 'grace', 'linus']) {
		const author = await Author.createOne({ data: { name } }, master)
		for (const index of [1, 2]) {
			await Post.createOne(
				{
					data: {
						author: { connect: author.id },
						tags: { connect: [first, ...others] },
						title: `${name}-${String(index)}`,
					},
				},
				master,
			)
		}
	}
}, 30_000)

afterAll(async () => {
	await ultimabase?.dispose()
	await fixture?.dispose()
})

describe('reads with include (ADR-0325)', { concurrent: false }, () => {
	beforeEach(() => {
		pool().reset()
		labelCalls.length = 0
	})

	it('issues one statement for nested includes in TypeScript', async () => {
		const authors = await Author.findMany({
			include: {
				posts: { include: { tags: { select: { label: true } } } },
			},
			orderBy: { name: 'asc' },
		})

		expect(authors).toHaveLength(3)
		expect(authors.flatMap(({ posts }) => posts)).toHaveLength(6)
		expect(statements()).toHaveLength(1)
		// One `resolveMany` call per included parent (six posts), never per tag.
		expect(labelCalls).toStrictEqual([3, 3, 3, 3, 3, 3])
	})

	it('issues one statement for a GraphQL selection of relations', async () => {
		const application = ultimabase
		if (application === undefined) throw new TypeError('No application')
		const result = await application
			.plugin('@ultimabase/graphql-plugin')
			.execute({
				context: anonymous(application, {
					requestId: 'include-query-count',
					source: 'ultimabase.graphql',
				}).context,
				document: `{
				findManyCountAuthor(first: 10) {
					nodes {
						name
						posts(first: 10) {
							nodes { title author { name } tags { nodes { name label } } }
						}
					}
				}
			}`,
			})

		expect(result.errors).toBeUndefined()
		expect(statements()).toHaveLength(1)
		expect(labelCalls).toHaveLength(6)
	})

	it('counts root connections, not relation connections', async () => {
		const application = ultimabase
		if (application === undefined) throw new TypeError('No application')
		const execute = (document: string) =>
			application.plugin('@ultimabase/graphql-plugin').execute({
				context: anonymous(application, {
					requestId: 'include-total-count',
					source: 'ultimabase.graphql',
				}).context,
				document,
			})

		expect(
			await execute('{ findManyCountPost(first: 1) { totalCount } }'),
		).toEqual({ data: { findManyCountPost: { totalCount: 6 } } })
		const relation = await execute(
			'{ findManyCountAuthor(first: 1) { nodes { posts { totalCount } } } }',
		)
		expect(relation.errors?.[0]).toMatchObject({
			extensions: { code: 'VALIDATION_ERROR' },
			message:
				'totalCount is available on root connections only, not on relation connections.',
		})
	})

	it('issues one statement for a REST read with include', async () => {
		if (capture.current === undefined) throw new TypeError('HTTP unavailable')
		const headers = new Headers({
			'Content-Type': 'application/json',
			[httpApplicationIdHeader]: appId,
		})
		const originalHeaders: HttpOriginalHeader[] = [...headers.entries()]
		const response = await capture.current.fetch({
			originalHeaders,
			request: new Request(
				'https://example.test/api/classes/CountAuthor/query',
				{
					body: JSON.stringify({
						include: {
							posts: { include: { tags: { select: { label: true } } } },
						},
					}),
					headers,
					method: 'POST',
				},
			),
		})

		expect(response.status).toBe(200)
		expect(statements()).toHaveLength(1)
		expect(labelCalls).toHaveLength(6)
	})
})
