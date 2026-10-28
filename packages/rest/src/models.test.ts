// A model's routes (D-129): its list, its row and its writes, their
// statuses, the rows as GraphQL returns them, and the refusals at start.
import { afterEach, describe, expect, it } from 'vitest'
import { allow, defineModel } from 'ultimabase'
import { rest } from './index.ts'
import {
	asMaster,
	at,
	call,
	M,
	Post,
	qs,
	seeded,
	started,
	Tag,
	User,
} from './test/app.ts'

let stop: (() => Promise<void>) | undefined
afterEach(async () => {
	await stop?.()
	stop = undefined
})

async function serving(...args: Parameters<typeof started>) {
	const running = await started(...args)
	stop = async () => running.app.stop()
	return running
}

const iso = (day: number) => new Date(Date.UTC(2026, 0, day)).toISOString()

describe('GET /api/posts', () => {
	it('returns a connection of the readable scalar fields', async () => {
		const { url } = await serving()
		await seeded()
		const sent = await call(url, 'GET', '/api/posts')
		expect(sent.status).toBe(200)
		const edges = at(sent.body, 'edges')
		expect(Array.isArray(edges) && edges.length).toBe(4)
		const node = at(sent.body, 'edges', 0, 'node')
		expect(Object.keys(node ?? {})).toEqual([
			'id',
			'createdAt',
			'updatedAt',
			'title',
			'slug',
			'status',
			'views',
			'meta',
			'publishedAt',
		])
		expect(node).toMatchObject({
			title: 'one',
			status: 'published',
			views: 0,
			meta: { index: 0 },
			publishedAt: iso(1),
		})
		expect(at(sent.body, 'pageInfo')).toEqual({
			hasNextPage: false,
			hasPreviousPage: false,
			startCursor: at(sent.body, 'edges', 0, 'cursor'),
			endCursor: at(sent.body, 'edges', 3, 'cursor'),
		})
	})

	it('never returns a private field, and null for an unreadable one', async () => {
		const { url } = await serving()
		await seeded()
		const sent = await call(url, 'GET', `/api/users${qs({ first: 1 })}`, {
			headers: asMaster,
		})
		const node = at(sent.body, 'edges', 0, 'node')
		expect(Object.keys(node ?? {})).toEqual([
			'id',
			'createdAt',
			'updatedAt',
			'name',
			'email',
		])
		const anonymous = await call(url, 'GET', `/api/users${qs({ first: 1 })}`)
		expect(at(anonymous.body, 'edges', 0, 'node', 'email')).toBeNull()
	})

	it('returns a plain list with pagination: list', async () => {
		const { url } = await serving({ pagination: 'list' })
		await seeded()
		const sent = await call(
			url,
			'GET',
			`/api/posts${qs({ orderBy: { views: 'desc' }, take: 2, skip: 1 })}`,
		)
		expect(sent.status).toBe(200)
		expect(
			Array.isArray(sent.body) && sent.body.map((row) => at(row, 'title')),
		).toEqual(['three', 'two'])
	})
})

describe('GET /api/posts/:id', () => {
	it('returns the row', async () => {
		const { url } = await serving()
		await seeded()
		const one = await Post.findFirst({ where: { title: 'one' } }, M)
		const sent = await call(url, 'GET', `/api/posts/${one?.id}`)
		expect(sent.status).toBe(200)
		expect(sent.body).toMatchObject({ id: one?.id, title: 'one' })
	})

	it('is 404 NOT_FOUND for a row the caller cannot find', async () => {
		const { url } = await serving()
		const sent = await call(url, 'GET', '/api/posts/nothing')
		expect(sent).toEqual({
			status: 404,
			body: { code: 'NOT_FOUND', message: 'No Post matches.' },
		})
	})

	it('reads the relations it includes', async () => {
		const { url } = await serving()
		await seeded()
		const one = await Post.findFirst({ where: { title: 'one' } }, M)
		const sent = await call(
			url,
			'GET',
			`/api/posts/${one?.id}${qs({ select: { title: true, author: { select: { name: true } } } })}`,
		)
		// A selection returns what it selects, as GraphQL does.
		expect(sent.body).toEqual({ title: 'one', author: { name: 'ada' } })
	})

	it('is a 500 when a read rule breaks', async () => {
		const { url } = await serving()
		await seeded()
		const sent = await call(url, 'GET', '/api/secrets')
		expect(sent.status).toBe(500)
		expect(at(sent.body, 'code')).toBe('INTERNAL')
	})
})

describe('POST /api/posts', () => {
	it('creates the row: 201, its dates ISO text read back to dates', async () => {
		const { url } = await serving()
		const { ada } = await seeded()
		const sent = await call(
			url,
			'POST',
			`/api/posts${qs({ include: { author: true } })}`,
			{
				headers: asMaster,
				body: {
					title: 'five',
					slug: 'five',
					status: 'draft',
					publishedAt: iso(5),
					author: { connect: { id: ada } },
				},
			},
		)
		expect(sent.status).toBe(201)
		expect(sent.body).toMatchObject({
			title: 'five',
			publishedAt: iso(5),
			author: { id: ada, name: 'ada' },
		})
		const five = await Post.findFirst({ where: { title: 'five' } }, M)
		expect(five?.publishedAt).toEqual(new Date(iso(5)))
	})

	it('refuses a date that is not ISO 8601 text', async () => {
		const { url } = await serving()
		const sent = await call(url, 'POST', '/api/posts', {
			headers: asMaster,
			body: { publishedAt: 'tomorrow' },
		})
		expect(sent).toEqual({
			status: 400,
			body: {
				code: 'BAD_USER_INPUT',
				message:
					'data.publishedAt must be an ISO 8601 DateTime, such as 2026-01-31T12:00:00.000Z.',
				details: { path: 'data.publishedAt' },
			},
		})
	})

	it('is 403 for a caller its access refuses', async () => {
		const { url } = await serving()
		const sent = await call(url, 'POST', '/api/posts', { body: {} })
		expect(sent.status).toBe(403)
		expect(at(sent.body, 'code')).toBe('ACCESS_DENIED')
	})

	it('takes a JSON body only', async () => {
		const { url } = await serving()
		const form = await fetch(`${url}/api/posts`, {
			method: 'POST',
			headers: asMaster,
			body: 'title=five',
		})
		expect(form.status).toBe(415)
		const broken = await fetch(`${url}/api/posts`, {
			method: 'POST',
			headers: { ...asMaster, 'content-type': 'application/json' },
			body: '{',
		})
		expect(broken.status).toBe(400)
	})

	it('leaves a body that is not an object to the kernel', async () => {
		const { url } = await serving()
		const sent = await call(url, 'POST', '/api/posts', {
			headers: asMaster,
			body: [],
		})
		expect(sent.status).toBe(400)
	})

	it('connects a hidden model, never creates it (D-128)', async () => {
		const { url } = await serving()
		const { ada } = await seeded()
		const tag = await Tag.create({ data: { label: 'news' } }, M)
		const data = {
			title: 'five',
			slug: 'five',
			status: 'draft',
			author: { connect: { id: ada } },
		}
		const connected = await call(
			url,
			'POST',
			`/api/posts${qs({ select: { tags: { select: { label: true } } } })}`,
			{
				headers: asMaster,
				body: { ...data, tags: { connect: [{ id: tag.id }] } },
			},
		)
		expect(connected.status).toBe(201)
		expect(at(connected.body, 'tags', 'edges', 0, 'node')).toEqual({
			label: 'news',
		})
		const created = await call(url, 'POST', '/api/posts', {
			headers: asMaster,
			body: { ...data, slug: 'six', tags: { create: [{ label: 'x' }] } },
		})
		expect(created).toEqual({
			status: 400,
			body: {
				code: 'BAD_USER_INPUT',
				message: "Unknown key 'data.tags.create' on Post.",
				details: { path: 'data.tags.create' },
			},
		})
	})

	it('creates a routed model in a relation, its dates read', async () => {
		const { url } = await serving()
		const sent = await call(
			url,
			'POST',
			`/api/users${qs({ include: { posts: { select: { publishedAt: true } } } })}`,
			{
				headers: asMaster,
				body: {
					name: 'cy',
					email: 'cy@example.com',
					posts: {
						create: [
							{ title: 'a', slug: 'a', status: 'draft', publishedAt: iso(9) },
						],
					},
				},
			},
		)
		expect(sent.status).toBe(201)
		expect(at(sent.body, 'posts', 'edges', 0, 'node', 'publishedAt')).toBe(
			iso(9),
		)
	})
})

describe('PATCH /api/posts/:id', () => {
	it('updates the row', async () => {
		const { url } = await serving()
		await seeded()
		const one = await Post.findFirst({ where: { title: 'one' } }, M)
		const sent = await call(url, 'PATCH', `/api/posts/${one?.id}`, {
			headers: asMaster,
			body: { views: 7, publishedAt: null },
		})
		expect(sent.status).toBe(200)
		expect(sent.body).toMatchObject({ views: 7, publishedAt: null })
	})

	it('refuses a number update, which is the server API only (D-132)', async () => {
		const { url } = await serving()
		await seeded()
		const one = await Post.findFirst({ where: { title: 'one' } }, M)
		const sent = await call(url, 'PATCH', `/api/posts/${one?.id}`, {
			headers: asMaster,
			body: { views: { increment: 1 } },
		})
		expect(sent).toEqual({
			status: 400,
			body: {
				code: 'BAD_USER_INPUT',
				message: 'data.views must be a number.',
				details: { path: 'data.views' },
			},
		})
	})

	it('reads the dates of the rows its relation writes reach (D-138)', async () => {
		const { url } = await serving()
		const { ada } = await seeded()
		const one = await Post.findFirst({ where: { title: 'one' } }, M)
		const two = await Post.findFirst({ where: { title: 'two' } }, M)
		const select = { posts: { select: { slug: true, publishedAt: true } } }
		const sent = await call(
			url,
			'PATCH',
			`/api/users/${ada}${qs({ select })}`,
			{
				headers: asMaster,
				body: {
					posts: {
						delete: [{ id: two?.id }],
						connectOrCreate: [
							{
								where: { id: 'none' },
								create: {
									title: 'n',
									slug: 'n',
									status: 'draft',
									publishedAt: iso(21),
								},
							},
						],
						update: [
							{ where: { id: one?.id }, data: { publishedAt: iso(20) } },
						],
					},
				},
			},
		)
		expect(sent.status).toBe(200)
		const stored = await Post.findMany(
			{ where: { author: { is: { id: ada } } }, orderBy: { slug: 'asc' } },
			M,
		)
		expect(stored.map((row) => [row.slug, row.publishedAt])).toEqual([
			['n', new Date(iso(21))],
			['one', new Date(iso(20))],
			['three', new Date(iso(3))],
		])
		const author = await call(
			url,
			'PATCH',
			`/api/posts/${one?.id}${qs({ select: { author: { select: { name: true } } } })}`,
			{ headers: asMaster, body: { author: { update: { name: 'ada2' } } } },
		)
		expect(at(author.body, 'author')).toEqual({ name: 'ada2' })
	})

	it('sets a hidden model, never updates or deletes it (D-138)', async () => {
		const { url } = await serving()
		await seeded()
		const one = await Post.findFirst({ where: { title: 'one' } }, M)
		const tag = await Tag.create(
			{ data: { label: 'news', post: { connect: { id: one?.id ?? '' } } } },
			M,
		)
		const set = await call(url, 'PATCH', `/api/posts/${one?.id}`, {
			headers: asMaster,
			body: { tags: { set: [] } },
		})
		expect(set.status).toBe(200)
		expect(
			await Tag.findUnique(
				{ where: { id: tag.id }, include: { post: true } },
				M,
			),
		).toMatchObject({ post: null })
		for (const key of ['update', 'delete', 'connectOrCreate']) {
			const sent = await call(url, 'PATCH', `/api/posts/${one?.id}`, {
				headers: asMaster,
				body: { tags: { [key]: [] } },
			})
			expect(sent).toEqual({
				status: 400,
				body: {
					code: 'BAD_USER_INPUT',
					message: `Unknown key 'data.tags.${key}' on Post.`,
					details: { path: `data.tags.${key}` },
				},
			})
		}
	})

	it('is 404 NOT_FOUND for a row it cannot find', async () => {
		const { url } = await serving()
		const sent = await call(url, 'PATCH', '/api/posts/nothing', {
			headers: asMaster,
			body: { views: 7 },
		})
		expect(sent.status).toBe(404)
		expect(at(sent.body, 'code')).toBe('NOT_FOUND')
	})
})

describe('PUT /api/posts (D-142)', () => {
	it('creates the row with 201, then updates it with 200', async () => {
		const { url } = await serving()
		const { ada } = await seeded()
		const body = {
			where: { author: ada, slug: 'five' },
			create: {
				title: 'five',
				slug: 'five',
				status: 'draft',
				publishedAt: iso(5),
				author: { connect: { id: ada } },
			},
			update: { views: 9, publishedAt: iso(6) },
		}
		const select = { title: true, views: true, publishedAt: true }
		const put = async () =>
			call(url, 'PUT', `/api/posts${qs({ select })}`, {
				headers: asMaster,
				body,
			})
		expect(await put()).toEqual({
			status: 201,
			body: { title: 'five', views: 0, publishedAt: iso(5) },
		})
		expect(await put()).toEqual({
			status: 200,
			body: { title: 'five', views: 9, publishedAt: iso(6) },
		})
		expect(await Post.count({}, M)).toBe(5)
	})

	it('takes { where, create, update } and nothing else', async () => {
		const { url } = await serving()
		const refused = async (body: unknown) =>
			call(url, 'PUT', '/api/posts', { headers: asMaster, body })
		expect(await refused([])).toEqual({
			status: 400,
			body: {
				code: 'BAD_USER_INPUT',
				message: 'The body must be an object.',
				details: { path: 'body' },
			},
		})
		expect(
			await refused({ where: { id: 'x' }, create: {}, update: {}, select: {} }),
		).toEqual({
			status: 400,
			body: {
				code: 'BAD_USER_INPUT',
				message: "Unknown key 'select' on Post.",
				details: { path: 'select' },
			},
		})
		expect(await refused({ where: { id: 'x' }, create: {} })).toEqual({
			status: 400,
			body: {
				code: 'BAD_USER_INPUT',
				message: 'update is required.',
				details: { path: 'update' },
			},
		})
		expect(
			await refused({
				where: { id: 'x' },
				create: {},
				update: { views: { increment: 1 } },
			}),
		).toMatchObject({
			status: 400,
			body: { message: 'update.views must be a number.' },
		})
	})
})

describe('DELETE /api/posts/:id', () => {
	it('returns the row as it was, without relations (D-102)', async () => {
		const { url } = await serving()
		await seeded()
		const one = await Post.findFirst({ where: { title: 'one' } }, M)
		const sent = await call(url, 'DELETE', `/api/posts/${one?.id}`, {
			headers: asMaster,
		})
		expect(sent.status).toBe(200)
		expect(sent.body).toMatchObject({ id: one?.id, title: 'one' })
		expect(at(sent.body, 'author')).toBeUndefined()
		expect(await Post.findUnique({ where: { id: one?.id ?? '' } }, M)).toBe(
			null,
		)
	})

	it('takes no query parameter', async () => {
		const { url } = await serving()
		const sent = await call(
			url,
			'DELETE',
			`/api/posts/x${qs({ select: { title: true } })}`,
			{ headers: asMaster },
		)
		expect(sent).toEqual({
			status: 400,
			body: {
				code: 'BAD_USER_INPUT',
				message: "Unknown query parameter 'select'; this route takes none.",
			},
		})
	})
})

describe('routes', () => {
	it('has none for a hidden model', async () => {
		const { url } = await serving()
		expect((await call(url, 'GET', '/api/tags')).status).toBe(404)
	})

	it('are under the path option', async () => {
		const { url, lines } = await serving({ path: '/v1/' })
		expect((await call(url, 'GET', '/v1/posts')).status).toBe(200)
		expect(lines).toContainEqual({ level: 'info', first: `REST on ${url}/v1.` })
	})

	it('are not logged in production', async () => {
		const before = process.env['NODE_ENV']
		process.env['NODE_ENV'] = 'production'
		try {
			const { lines } = await serving()
			const logged = lines.some(
				(line) =>
					typeof line.first === 'string' && line.first.startsWith('REST'),
			)
			expect(logged).toBe(false)
		} finally {
			process.env['NODE_ENV'] = before
		}
	})

	it('take a model’s plural', async () => {
		const Person = defineModel({
			name: 'Person',
			use: [rest()],
			fields: (f) => ({ name: f.string() }),
		}).with({ access: allow.public, rest: { plural: 'people' } })
		const { url } = await serving({}, undefined, [], [Person])
		expect((await call(url, 'GET', '/api/people')).status).toBe(200)
	})
})

const named = (name: string, plural?: string) =>
	defineModel({
		name,
		use: [rest()],
		fields: (f) => ({ name: f.string() }),
	}).with(plural === undefined ? {} : { rest: { plural } })

describe('start', () => {
	it('refuses two models of one plural', async () => {
		await expect(
			started({}, undefined, [], [named('Box'), named('Crate', 'boxes')]),
		).rejects.toThrow(
			"Crate: the route boxes is Box's; set .with({ rest: { plural } }).",
		)
	})

	it('refuses the plural functions', async () => {
		await expect(
			started({}, undefined, [], [named('Job', 'functions')]),
		).rejects.toThrow(
			"Job: the route functions is the functions's; set .with({ rest: { plural } }).",
		)
	})

	it('refuses a plural that is not a route name', async () => {
		await expect(
			started({}, undefined, [], [named('Job', 'my-jobs')]),
		).rejects.toThrow('Job: my-jobs is not a route name.')
	})

	it('names plurals as GraphQL does', async () => {
		const { url } = await serving(
			{},
			undefined,
			[],
			[named('Category'), named('Box'), named('Wish')],
		)
		for (const plural of ['categories', 'boxes', 'wishes']) {
			expect((await call(url, 'GET', `/api/${plural}`)).status).toBe(200)
		}
	})
})

describe('a user’s posts', () => {
	it('is a connection of its own arguments', async () => {
		const { url } = await serving()
		const { ada } = await seeded()
		const sent = await call(
			url,
			'GET',
			`/api/users/${ada}${qs({
				include: { posts: { first: 1, orderBy: { title: 'desc' } } },
			})}`,
		)
		expect(at(sent.body, 'posts', 'edges', 0, 'node', 'title')).toBe('two')
		expect(at(sent.body, 'posts', 'pageInfo', 'hasNextPage')).toBe(true)
		expect(at(sent.body, 'name')).toBe('ada')
	})

	it('is a list with pagination: list', async () => {
		const { url } = await serving({ pagination: 'list' })
		const { ada } = await seeded()
		const sent = await call(
			url,
			'GET',
			`/api/users/${ada}${qs({ select: { posts: { take: 1, skip: 1, orderBy: { title: 'asc' } } } })}`,
		)
		expect(sent.body).toEqual({
			posts: [expect.objectContaining({ title: 'three' })],
		})
	})

	it('reads User as a relation the caller cannot see', async () => {
		const { url } = await serving()
		await seeded()
		const sent = await call(
			url,
			'GET',
			`/api/posts${qs({ first: 1, select: { author: { include: { posts: true } } } })}`,
		)
		expect(sent.status).toBe(200)
		expect(at(sent.body, 'edges', 0, 'node', 'author', 'name')).toBe('ada')
		expect(User).toBeDefined()
	})
})
