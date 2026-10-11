import { accessPlugin } from '@ultimabase/access-plugin'
import { FrameworkError, MasterAuthority, UltimaBase } from '@ultimabase/core'

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

// ADR-0309: `findMany({ after })` pages by position in a total order, and
// REST and GraphQL encode the same positions with one shared cursor encoder.
const App = UltimaBase.use(accessPlugin({ default: true }))

const Item = App.Schema.define({
	className: 'KeysetItem',
	fields: (field) => ({
		group: field.string({ required: true }),
		hidden: field.int({ access: { read: false, write: true } }),
		rank: field.int(),
		title: field.string({ required: true }),
		unfilterable: field.int({
			access: {
				read: { orderBy: true, output: true, where: false },
				write: true,
			},
		}),
	}),
})

// ADR-0309 step 3b amendment: included relations page by position too.
const Group = App.Schema.define({
	className: 'KeysetGroup',
	fields: (field) => ({
		items: field.relation({ target: 'KeysetItem' }),
		name: field.string({ required: true }),
	}),
})

const httpRequirement = requireCapability(httpApplicationCapability, '^1.0.0', {
	phase: 'setup',
})
const capture: { current?: HttpApplication } = {}
const capturePlugin = plugin({
	core: '^0.0.0',
	id: 'fixture.keyset-pagination-capture',
	version: '1.0.0',
	contributions: [
		httpRequirement,
		contributeApplication(({ capabilities }) => {
			capture.current = capabilities.get(httpRequirement)
			return { exports: undefined }
		}),
	],
})

const appId = 'keyset-pagination'
const createApplication = (pool: RecordingPostgresPool) =>
	new (App.use(
		restPlugin(),
		graphqlPlugin(),
		httpPlugin({ appId }),
		capturePlugin,
		postgresPlugin({ pool, schemaPolicy: 'override' }),
	))({
		masterAuthority: new MasterAuthority({
			keys: [{ id: 'keyset', value: 'keyset-pagination-secret' }],
			onUse: () => undefined,
		}),
		logger: false,
		schemas: [Item, Group],
	})

let fixture: PostgresWorkerFixture | undefined
let recorder: RecordingPostgresPool | undefined
let ultimabase: ReturnType<typeof createApplication> | undefined
const master = { useMasterKey: true } as const
const application = () => {
	if (ultimabase === undefined) throw new TypeError('Application unavailable')
	return ultimabase
}

type Row = Readonly<{ id: string; rank: number | null; title: string }>
type OrderBy = Readonly<Record<string, 'asc' | 'desc'>>

const seed = async (
	rows: readonly Readonly<{
		group?: string
		rank: number | null
		title: string
	}>[],
) => {
	const existing = await Item.findMany({ select: { id: true } }, master)
	if (existing.length > 0) {
		await Item.deleteMany({ where: existing.map(({ id }) => ({ id })) }, master)
	}
	return Item.createMany(
		{ data: rows.map((row) => ({ group: 'a', ...row })) },
		master,
	)
}

/** Reads every page of `take` rows through `after`, as a client would. */
const traverse = async (orderBy: OrderBy, take: number) => {
	const pages: string[][] = []
	let after: Row | undefined
	for (;;) {
		const page: readonly Row[] = await Item.findMany({
			orderBy,
			take,
			select: { id: true, rank: true, title: true, group: true },
			...(after === undefined ? {} : { after }),
		})
		if (page.length === 0) break
		pages.push(page.map(({ id }) => id))
		after = page.at(-1)
		if (page.length < take) break
	}
	return pages
}

const ordered = async (orderBy: OrderBy) =>
	(await Item.findMany({ orderBy, select: { id: true } })).map(({ id }) => id)

const caught = async (run: () => Promise<unknown>) => {
	const error: unknown = await Promise.resolve()
		.then(run)
		.then(
			() => undefined,
			(failure: unknown) => failure,
		)
	if (!(error instanceof FrameworkError)) throw error
	const code: unknown = error.code
	const publicDetails: unknown = error.publicDetails
	return { code, publicDetails }
}

const fetchApplication = async (path: string): Promise<unknown> => {
	if (capture.current === undefined) throw new TypeError('HTTP unavailable')
	const headers = new Headers({ [httpApplicationIdHeader]: appId })
	const originalHeaders: HttpOriginalHeader[] = [...headers.entries()]
	const response = await capture.current.fetch({
		originalHeaders,
		request: new Request(`https://example.test${path}`, { headers }),
	})
	return response.json()
}

const read = (value: unknown, key: string): unknown =>
	typeof value === 'object' && value !== null
		? Reflect.get(value, key)
		: undefined

const graphql = (document: string) =>
	application()
		.plugin('@ultimabase/graphql-plugin')
		.execute({
			context: anonymous(application(), {
				requestId: 'keyset-graphql',
				source: 'ultimabase.graphql',
			}).context,
			document,
		})

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({ prefix: 'keyset_pages' })
	recorder = new RecordingPostgresPool(fixture.pool)
	ultimabase = createApplication(recorder)
	await ultimabase.start()
}, 30_000)

afterAll(async () => {
	await ultimabase?.dispose()
	await fixture?.dispose()
})

describe('keyset pagination (ADR-0309)', { concurrent: false }, () => {
	beforeEach(async () => {
		await seed([
			{ rank: 3, title: 'c' },
			{ rank: 1, title: 'a' },
			{ rank: null, title: 'n1' },
			{ group: 'b', rank: 3, title: 'c2' },
			{ rank: 2, title: 'b' },
			{ group: 'b', rank: null, title: 'n2' },
			{ rank: 1, title: 'a2' },
		])
	})

	it('traverses ascending, descending, mixed and nullable orders without gaps or repeats', async () => {
		for (const orderBy of [
			{ rank: 'asc' },
			{ rank: 'desc' },
			{ group: 'desc', rank: 'asc' },
			{ rank: 'desc', title: 'desc' },
			{ title: 'asc' },
			{},
		] satisfies OrderBy[]) {
			const all = await ordered(orderBy)
			for (const take of [1, 2, 3]) {
				const pages = await traverse(orderBy, take)
				expect(pages.flat(), JSON.stringify({ orderBy, take })).toStrictEqual(
					all,
				)
			}
		}
		// Null sorts last in both directions (ADR-0302).
		const rows = await Item.findMany({
			orderBy: { rank: 'desc' },
			select: { rank: true },
		})
		expect(rows.map(({ rank }) => rank).slice(-2)).toStrictEqual([null, null])
	})

	it('breaks ties by id ascending', async () => {
		await seed(['d', 'b', 'a', 'c'].map((title) => ({ rank: 5, title })))
		const ids = (await Item.findMany({ select: { id: true } }))
			.map(({ id }) => id)
			.toSorted()
		expect((await traverse({ rank: 'asc' }, 1)).flat()).toStrictEqual(ids)
	})

	it('never repeats or skips unchanged rows when rows are inserted or deleted', async () => {
		const orderBy = { rank: 'asc', title: 'asc' } as const
		const first = await Item.findMany({ orderBy, take: 3 })
		const last = first.at(-1)
		if (last === undefined) throw new TypeError('Expected a first page')
		const removed = (await Item.findMany({ orderBy, skip: 3, take: 1 }))[0]
		if (removed === undefined) throw new TypeError('Expected a later row')
		await Item.deleteOne({ where: { id: removed.id } }, master)
		// One row before the position and one after it.
		await Item.createMany(
			{
				data: [
					{ group: 'a', rank: 0, title: 'early' },
					{ group: 'a', rank: 2, title: 'late' },
				],
			},
			master,
		)
		const rest = await Item.findMany({ orderBy, after: last })
		const titles = rest.map(({ title }) => title)

		expect(titles).toContain('late')
		expect(titles).not.toContain('early')
		expect(rest.map(({ id }) => id)).not.toContain(removed.id)
		for (const row of first)
			expect(rest.map(({ id }) => id)).not.toContain(row.id)
	})

	it('treats a forged position as the matching filter', async () => {
		const all = await Item.findMany({
			orderBy: { rank: 'asc' },
			select: { id: true, rank: true },
		})
		const forged = { id: '0198f090-2a50-7000-8000-000000000000', rank: 2 }
		const expected = all
			.filter(
				({ id, rank }) =>
					rank === null || rank > 2 || (rank === 2 && id > forged.id),
			)
			.map(({ id }) => id)

		expect(
			(await Item.findMany({ orderBy: { rank: 'asc' }, after: forged })).map(
				({ id }) => id,
			),
		).toStrictEqual(expected)
		// The position is a caller filter combined with `where` by AND.
		expect(
			(
				await Item.findMany({
					orderBy: { rank: 'asc' },
					after: forged,
					where: { group: 'b' },
				})
			).map(({ title }) => title),
		).toStrictEqual(['c2', 'n2'])
	})

	it('refuses ordering by a hidden field and positions on an unfilterable one', async () => {
		await expect(
			caught(() => Item.findMany({ orderBy: { hidden: 'asc' } })),
		).resolves.toMatchObject({ code: 'PERMISSION_DENIED' })
		const page = await Item.findMany({
			orderBy: { unfilterable: 'asc' },
			take: 1,
		})
		expect(page).toHaveLength(1)
		const position = { id: page[0]?.id ?? '', unfilterable: null }
		await expect(
			caught(() =>
				Item.findMany({ orderBy: { unfilterable: 'asc' }, after: position }),
			),
		).resolves.toMatchObject({ code: 'PERMISSION_DENIED' })
	})

	it('names a missing ordered field and refuses skip with after', async () => {
		const [row] = await Item.findMany({
			orderBy: { rank: 'asc' },
			select: { title: true, id: true },
			take: 1,
		})
		if (row === undefined) throw new TypeError('Expected a row')
		await expect(
			caught(() => Item.findMany({ orderBy: { rank: 'asc' }, after: row })),
		).resolves.toStrictEqual({
			code: 'VALIDATION_ERROR',
			publicDetails: { parameter: 'after' },
		})
		await expect(
			caught(() => Item.findMany({ after: row, skip: 1 })),
		).resolves.toStrictEqual({
			code: 'VALIDATION_ERROR',
			publicDetails: { parameter: 'after' },
		})
	})

	it('compiles a keyset predicate and no OFFSET', async () => {
		const [row] = await Item.findMany({ orderBy: { rank: 'desc' }, take: 1 })
		if (row === undefined) throw new TypeError('Expected a row')
		const pool = recorder
		if (pool === undefined) throw new TypeError('Recorder unavailable')
		pool.reset()
		await Item.findMany({ orderBy: { rank: 'desc' }, take: 2, after: row })
		const statement = pool.statements
			.filter((text) => text.trimStart().toLowerCase().startsWith('select'))
			.join('\n')
			.toLowerCase()
		expect(statement).toMatch(/ < \$\d/u)
		expect(statement).toMatch(/is null/u)
		expect(statement).toMatch(/order by .* desc nulls last, .* asc nulls last/u)
		expect(statement).not.toMatch(/\boffset\b/u)

		pool.reset()
		await Item.findMany({ orderBy: { rank: 'desc' }, take: 2, skip: 1 })
		expect(pool.statements.join('\n').toLowerCase()).toMatch(/\boffset\b/u)
	})

	it('pages an included relation by position in every parent, without OFFSET', async () => {
		const items = await Item.createMany(
			{
				data: [
					{ group: 'g', rank: 3, title: 'g1-3' },
					{ group: 'g', rank: 2, title: 'g1-2' },
					{ group: 'g', rank: 1, title: 'g1-1' },
					{ group: 'g', rank: 3, title: 'g2-3' },
					{ group: 'g', rank: 1, title: 'g2-1' },
				],
			},
			master,
		)
		const [g1a, g1b, g1c, g2a, g2b] = items.map(({ id }) => id)
		if (
			g1a === undefined ||
			g1b === undefined ||
			g1c === undefined ||
			g2a === undefined ||
			g2b === undefined
		) {
			throw new TypeError('Expected five items')
		}
		const first = await Group.createOne(
			{
				data: {
					items: { connect: [g1a, g1b, g1c] },
					name: 'first',
				},
			},
			master,
		)
		const second = await Group.createOne(
			{ data: { items: { connect: [g2a, g2b] }, name: 'second' } },
			master,
		)
		const readItems = async (after?: Row) =>
			(
				await Group.findMany({
					where: { id: { in: [first.id, second.id] } },
					orderBy: { name: 'asc' },
					select: { name: true },
					include: {
						items: {
							orderBy: { rank: 'desc' },
							select: { rank: true, title: true },
							take: 1,
							...(after === undefined ? {} : { after }),
						},
					},
				})
			).map(({ items: page }) => page.map(({ title }) => title))

		// Each parent reads its own first member; `after` continues each one.
		expect(await readItems()).toStrictEqual([['g1-3'], ['g2-3']])
		const position = items[1]
		if (position === undefined) throw new TypeError('Expected the position')
		const pool = recorder
		if (pool === undefined) throw new TypeError('Recorder unavailable')
		pool.reset()
		expect(await readItems(position)).toStrictEqual([['g1-1'], ['g2-1']])
		expect(pool.statements.join('\n').toLowerCase()).not.toMatch(/\boffset\b/u)

		// Walking one parent's collection visits every member exactly once.
		const visited: unknown[] = []
		let after: Readonly<{ id: string; [field: string]: unknown }> | undefined
		for (;;) {
			const group = await Group.findOneOrThrow({
				where: { id: { eq: first.id } },
				include: {
					items: {
						orderBy: { rank: 'desc' },
						select: { rank: true, title: true },
						take: 1,
						...(after === undefined ? {} : { after }),
					},
				},
			})
			const member = group.items[0]
			if (member === undefined) break
			visited.push(member.title)
			after = member
		}
		expect(visited).toStrictEqual(['g1-3', 'g1-2', 'g1-1'])
		await Group.deleteMany(
			{ where: [{ id: { eq: first.id } }, { id: { eq: second.id } }] },
			master,
		)
	})

	it('returns the same pages through Core, REST and GraphQL', async () => {
		const orderBy = { rank: 'desc', title: 'asc' } as const
		const core = await traverse(orderBy, 2)

		const restPages: string[][] = []
		const restCursors: string[] = []
		let cursor: unknown = undefined
		for (;;) {
			const query = new URLSearchParams({
				orderBy: '-rank,title',
				select: 'title',
				take: '2',
				...(typeof cursor === 'string' ? { after: cursor } : {}),
			})
			const body = await fetchApplication(
				`/api/v1/classes/KeysetItem?${query.toString()}`,
			)
			const results: unknown = read(body, 'results')
			if (!Array.isArray(results)) throw new TypeError(JSON.stringify(body))
			// Fields added only to encode the cursor are not returned; `id` is
			// part of every result (ADR-0181).
			for (const result of results as unknown[])
				expect(Object.keys(result ?? {})).toStrictEqual(['title', 'id'])
			restPages.push(
				results.map((result: unknown) => String(read(result, 'title'))),
			)
			cursor = read(body, 'nextCursor')
			if (typeof cursor !== 'string') break
			restCursors.push(cursor)
		}

		const graphPages: string[][] = []
		const graphCursors: string[] = []
		let after: string | undefined
		for (;;) {
			const result = await graphql(`
				query {
					findManyKeysetItem(
						first: 2
						orderBy: [{ field: rank, direction: DESC }, { field: title, direction: ASC }]
						${after === undefined ? '' : `after: "${after}"`}
					) {
						nodes { id title }
						pageInfo { endCursor hasNextPage }
					}
				}
			`)
			expect(result.errors).toBeUndefined()
			const connection = read(result.data, 'findManyKeysetItem')
			const nodes = read(connection, 'nodes')
			const pageInfo = read(connection, 'pageInfo')
			if (!Array.isArray(nodes)) throw new TypeError('Expected nodes')
			graphPages.push(nodes.map((node: unknown) => String(read(node, 'id'))))
			if (read(pageInfo, 'hasNextPage') !== true) break
			after = String(read(pageInfo, 'endCursor'))
			graphCursors.push(after)
		}

		const titles = new Map(
			(await Item.findMany({ select: { id: true, title: true } })).map(
				({ id, title }) => [id, title],
			),
		)
		expect(graphPages).toStrictEqual(core)
		expect(restPages).toStrictEqual(
			core.map((page) => page.map((id) => titles.get(id))),
		)
		// One encoder: the same position is the same cursor in both transports.
		expect(restCursors).toStrictEqual(graphCursors)
	})

	it('rejects a malformed or mismatched cursor in REST and GraphQL alike', async () => {
		const first = await fetchApplication(
			'/api/v1/classes/KeysetItem?orderBy=rank&take=1',
		)
		const cursor = String(read(first, 'nextCursor'))
		for (const query of [
			'after=not-a-cursor',
			`orderBy=-rank&take=1&after=${cursor}`,
			`take=1&skip=1&after=${cursor}`,
		]) {
			const body = await fetchApplication(`/api/v1/classes/KeysetItem?${query}`)
			expect(read(body, 'error')).toMatchObject({
				code: 'VALIDATION_ERROR',
				details: { parameter: 'after' },
			})
		}
		const result = await graphql(`
			query {
				findManyKeysetItem(after: "not-a-cursor") {
					nodes {
						id
					}
				}
			}
		`)
		expect(result.errors?.[0]?.extensions).toMatchObject({
			code: 'VALIDATION_ERROR',
			details: { parameter: 'after' },
		})
	})
})
