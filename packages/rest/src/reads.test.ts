// A list's query parameters (D-129): GraphQL's arguments by name, their
// refusals, their pages and the limits a caller other than Master reads in.
import { afterEach, describe, expect, it } from 'vitest'
import type { RestOptions } from './index.ts'
import { asMaster, at, call, qs, seeded, started } from './test/app.ts'
import type { Sent } from './test/app.ts'

let stop: (() => Promise<void>) | undefined
afterEach(async () => {
	await stop?.()
	stop = undefined
})

async function serving(options: RestOptions = {}) {
	const running = await started(options)
	stop = async () => running.app.stop()
	await seeded()
	return running
}

const titles = (body: unknown): unknown => {
	const edges = at(body, 'edges')
	return Array.isArray(edges)
		? edges.map((edge) => at(edge, 'node', 'title'))
		: Array.isArray(body)
			? body.map((row) => at(row, 'title'))
			: body
}

/** A user's name and the count of their posts. */
const counted = (edge: unknown) => [
	at(edge, 'node', 'name'),
	at(edge, 'node', 'posts', 'totalCount'),
]

const refused = (message: string, path?: string): Sent => ({
	status: 400,
	body: {
		code: 'BAD_USER_INPUT',
		message,
		...(path === undefined ? {} : { details: { path } }),
	},
})

const get = (url: string, path: string, params: Record<string, unknown>) =>
	call(url, 'GET', `${path}${qs(params)}`)

describe('where and orderBy', () => {
	it('filter and order as GraphQL does, dates as ISO text', async () => {
		const { url } = await serving()
		const sent = await get(url, '/api/posts', {
			where: {
				OR: [
					{ publishedAt: { gte: '2026-01-03T00:00:00.000Z' } },
					{ NOT: { author: { is: { name: 'ada' } } } },
					{ createdAt: { in: ['2000-01-01T00:00:00Z'] } },
				],
				AND: { status: 'published' },
			},
			orderBy: { views: 'desc' },
		})
		expect(titles(sent.body)).toEqual(['three'])
	})

	it('read a null where as none', async () => {
		const { url } = await serving()
		const sent = await get(url, '/api/posts', { where: null, orderBy: null })
		expect(titles(sent.body)).toEqual(['one', 'two', 'three', 'four'])
	})

	it('filter on a relation’s rows', async () => {
		const { url } = await serving()
		const sent = await get(url, '/api/users', {
			where: { posts: { some: { title: 'four' } } },
			select: { name: true },
		})
		expect(at(sent.body, 'edges', 0, 'node')).toEqual({ name: 'bob' })
	})

	it('leave a value that is not a filter to the kernel', async () => {
		const { url } = await serving()
		expect((await get(url, '/api/posts', { where: 3 })).status).toBe(400)
		const sent = await get(url, '/api/posts', {
			where: { views: { nope: 1 } },
		})
		expect(sent.status).toBe(400)
		expect(at(sent.body, 'details', 'path')).toBe('where.views.nope')
	})

	it('refuse a date that is not ISO text, with its path', async () => {
		const { url } = await serving()
		const sent = await get(url, '/api/posts', {
			where: { publishedAt: { in: ['soon'] } },
		})
		expect(sent).toEqual(
			refused(
				'where.publishedAt.in.0 must be an ISO 8601 DateTime, such as 2026-01-31T12:00:00.000Z.',
				'where.publishedAt.in.0',
			),
		)
	})
})

describe('select and include', () => {
	it('select returns what it selects, include adds to the scalars', async () => {
		const { url, app } = await serving()
		expect(app).toBeDefined()
		const selected = await get(url, '/api/posts', {
			first: 1,
			select: { title: true, views: false, author: { select: { name: true } } },
		})
		expect(at(selected.body, 'edges', 0, 'node')).toEqual({
			title: 'one',
			author: { name: 'ada' },
		})
		const included = await get(url, '/api/users', {
			first: 1,
			include: { posts: { last: 1, select: { title: true } } },
		})
		expect(at(included.body, 'edges', 0, 'node')).toMatchObject({
			name: 'ada',
			posts: {
				edges: [{ node: { title: 'three' } }],
				pageInfo: { hasNextPage: false, hasPreviousPage: true },
			},
		})
	})

	it('are never both given', async () => {
		const { url } = await serving()
		const sent = await get(url, '/api/posts', {
			select: { title: true },
			include: { author: true },
		})
		expect(sent).toEqual(
			refused('select and include cannot be used together.', ''),
		)
	})

	it.each([
		[{ select: 3 }, 'select must be an object.', 'select'],
		[
			{ select: { nope: true } },
			"Unknown key 'select.nope' on Post.",
			'select.nope',
		],
		[
			{ include: { title: true } },
			"Unknown key 'include.title' on Post.",
			'include.title',
		],
		[
			{ select: { title: 1 } },
			'select.title must be a boolean.',
			'select.title',
		],
		[
			{ select: { author: 1 } },
			'select.author must be an object.',
			'select.author',
		],
		[
			{ select: { author: { where: {} } } },
			"Unknown key 'select.author.where' on Post.",
			'select.author.where',
		],
		[
			{ include: { author: { include: { posts: { nope: 1 } } } } },
			"Unknown key 'include.author.include.posts.nope' on Post.",
			'include.author.include.posts.nope',
		],
		[
			{ include: { author: { include: { posts: { after: 3 } } } } },
			'include.author.include.posts.after must be a string.',
			undefined,
		],
	])('refuse %j', async (params, message, path) => {
		const { url } = await serving()
		expect(await get(url, '/api/posts', params)).toEqual(refused(message, path))
	})

	it('never read a private field', async () => {
		const { url } = await serving()
		const sent = await get(url, '/api/users', {
			select: { password: true },
		})
		expect(sent).toEqual(
			refused("Unknown key 'select.password' on User.", 'select.password'),
		)
	})
})

describe('the query string', () => {
	it('refuses a parameter the route does not take', async () => {
		const { url } = await serving()
		expect(await get(url, '/api/posts', { take: 1 })).toEqual(
			refused(
				"Unknown query parameter 'take'; this route takes where, orderBy, select, include, first, last, totalCount, after, before.",
			),
		)
	})

	it('refuses a parameter given twice, or not JSON', async () => {
		const { url } = await serving()
		expect(await call(url, 'GET', '/api/posts?first=1&first=2')).toEqual(
			refused('The query parameter first is given twice.'),
		)
		expect(await call(url, 'GET', '/api/posts?where={')).toEqual(
			refused('The query parameter where is not JSON.'),
		)
	})
})

describe('a connection', () => {
	it('pages forward and backward with cursors', async () => {
		const { url } = await serving()
		const first = await get(url, '/api/posts', { first: 2 })
		expect(titles(first.body)).toEqual(['one', 'two'])
		expect(at(first.body, 'pageInfo', 'hasNextPage')).toBe(true)
		const after = String(at(first.body, 'pageInfo', 'endCursor'))
		const next = await get(url, '/api/posts', { first: 2, after })
		expect(titles(next.body)).toEqual(['three', 'four'])
		const before = String(at(next.body, 'pageInfo', 'startCursor'))
		const back = await get(url, '/api/posts', { last: 1, before })
		expect(titles(back.body)).toEqual(['two'])
		expect(at(back.body, 'pageInfo', 'hasPreviousPage')).toBe(true)
	})

	it('counts the rows its filter matches', async () => {
		const { url } = await serving()
		const sent = await get(url, '/api/posts', {
			first: 1,
			where: { status: 'draft' },
			totalCount: true,
		})
		expect(titles(sent.body)).toEqual(['two'])
		expect(at(sent.body, 'totalCount')).toBe(2)
		const none = await get(url, '/api/posts', { totalCount: false })
		expect(at(none.body, 'totalCount')).toBeUndefined()
		expect(await get(url, '/api/posts', { totalCount: 1 })).toEqual(
			refused('totalCount must be true or false.'),
		)
	})

	it.each([
		[
			{ first: 1, last: 1 },
			'Page forward with first and after, or backward with last and before, not both.',
		],
		[{ first: -1 }, 'first cannot be negative.'],
		[{ first: 1.5 }, 'first must be an integer.'],
		[{ after: 'nope' }, 'after is not a cursor this API returned.'],
	])('refuses %j', async (params, message) => {
		const { url } = await serving()
		expect(await get(url, '/api/posts', params)).toEqual(refused(message))
	})

	it('returns the take option’s rows when none is asked for', async () => {
		const { url } = await serving({ take: 3 })
		const sent = await get(url, '/api/posts', {})
		expect(titles(sent.body)).toEqual(['one', 'two', 'three'])
		expect(at(sent.body, 'pageInfo', 'hasNextPage')).toBe(true)
	})
})

describe('the limits', () => {
	it('refuse more rows than a model’s maxTake, unless Master asks', async () => {
		const { url } = await serving({ maxTake: 50 })
		expect(await get(url, '/api/users', { first: 4 })).toEqual(
			refused('first is at most 3 on User.'),
		)
		expect(await get(url, '/api/posts', { last: 51 })).toEqual(
			refused('last is at most 50 on Post.'),
		)
		const master = await call(url, 'GET', `/api/users${qs({ first: 4 })}`, {
			headers: asMaster,
		})
		expect(master.status).toBe(200)
	})

	it('read Master’s whole list backward from a cursor', async () => {
		const { url } = await serving()
		const all = await call(url, 'GET', '/api/posts', { headers: asMaster })
		const before = String(at(all.body, 'pageInfo', 'endCursor'))
		const back = await call(url, 'GET', `/api/posts${qs({ before })}`, {
			headers: asMaster,
		})
		expect(titles(back.body)).toEqual(['one', 'two', 'three'])
		expect(at(back.body, 'pageInfo', 'hasPreviousPage')).toBe(false)
	})

	it('refuse a request nested deeper than maxDepth', async () => {
		const { url } = await serving({ maxDepth: 2 })
		const params = { include: { author: { include: { posts: true } } } }
		expect(await get(url, '/api/posts', params)).toEqual(
			refused(
				'The request is nested 3 levels deep, its orderBy included; the most is 2.',
			),
		)
		const master = await call(url, 'GET', `/api/posts${qs(params)}`, {
			headers: asMaster,
		})
		expect(master.status).toBe(200)
		expect(
			(await get(url, '/api/posts/x', { include: params.include })).status,
		).toBe(400)
	})

	it('refuse more rows than maxRows, each list times the lists above it', async () => {
		const { url } = await serving({ maxRows: 10 })
		expect(await get(url, '/api/posts', {})).toEqual(
			refused(
				'The request asks for more than 10 rows. Ask for fewer with first or last.',
			),
		)
		const tooMany = await get(url, '/api/users', {
			first: 2,
			include: { posts: { first: 3, include: { author: true } } },
		})
		expect(tooMany.status).toBe(400)
		const smaller = await get(url, '/api/users', {
			first: 2,
			include: { posts: { first: 2 } },
		})
		expect(smaller.status).toBe(200)
		// A count reads the rows it counts.
		expect(
			(await get(url, '/api/users', { first: 1, totalCount: true })).status,
		).toBe(400)
	})
})

describe('counts and sorts through relations (D-134)', () => {
	it('count an included relation and sort through relations', async () => {
		const { url } = await serving()
		const sent = await get(url, '/api/users', {
			orderBy: { posts: { _count: 'asc' } },
			select: {
				name: true,
				posts: {
					first: 1,
					where: { status: 'published' },
					totalCount: true,
					select: { title: true },
				},
			},
		})
		const users = at(sent.body, 'edges')
		expect(Array.isArray(users) && users.map(counted)).toEqual([
			['bob', 0],
			['ada', 2],
		])
		expect(titles(at(users, 1, 'node', 'posts'))).toEqual(['one'])
		const uncounted = await get(url, '/api/users', {
			include: { posts: { totalCount: false } },
		})
		expect(
			at(uncounted.body, 'edges', 0, 'node', 'posts', 'totalCount'),
		).toBeUndefined()
		const through = await get(url, '/api/posts', {
			orderBy: [{ author: { name: 'desc' } }, { views: 'asc' }],
		})
		expect(titles(through.body)).toEqual(['four', 'one', 'two', 'three'])
		expect(
			await get(url, '/api/users', {
				include: { posts: { totalCount: 1 } },
			}),
		).toEqual(
			refused(
				'include.posts.totalCount must be true or false.',
				'include.posts.totalCount',
			),
		)
	})

	it('count each relation an orderBy goes through as a level', async () => {
		const { url } = await serving({ maxDepth: 2 })
		const one = { orderBy: { author: { name: 'asc' } } }
		expect((await get(url, '/api/posts', one)).status).toBe(200)
		const two = { orderBy: [{ author: { posts: { _count: 'asc' } } }] }
		expect(await get(url, '/api/posts', two)).toEqual(
			refused(
				'The request is nested 3 levels deep, its orderBy included; the most is 2.',
			),
		)
		const master = await call(url, 'GET', `/api/posts${qs(two)}`, {
			headers: asMaster,
		})
		expect(master.status).toBe(200)
		const nested = { include: { posts: one } }
		expect((await get(url, '/api/users', nested)).status).toBe(400)
	})

	it('count a nested totalCount as the root one, take rows at least', async () => {
		const { url } = await serving({ maxRows: 10 })
		const posts = { first: 1, totalCount: true }
		expect(
			(await get(url, '/api/users', { first: 2, include: { posts } })).status,
		).toBe(400)
		const paged = { first: 2, include: { posts: { first: 1 } } }
		expect((await get(url, '/api/users', paged)).status).toBe(200)
	})
})

describe('pagination: list', () => {
	it('takes take and skip, and no count', async () => {
		const { url } = await serving({ pagination: 'list', maxRows: 10 })
		const sent = await get(url, '/api/posts', { take: 2, skip: 1 })
		expect(titles(sent.body)).toEqual(['two', 'three'])
		expect(await get(url, '/api/posts', { totalCount: true })).toEqual(
			refused(
				"Unknown query parameter 'totalCount'; this route takes where, orderBy, select, include, take, skip.",
			),
		)
		expect(await get(url, '/api/posts', {})).toEqual(
			refused(
				'The request asks for more than 10 rows. Ask for fewer with take.',
			),
		)
		const nested = { include: { posts: { totalCount: true } } }
		expect(await get(url, '/api/users', nested)).toEqual(
			refused(
				"Unknown key 'include.posts.totalCount' on Post.",
				'include.posts.totalCount',
			),
		)
	})
})
