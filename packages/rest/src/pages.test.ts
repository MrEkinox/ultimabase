// A function's page over REST (D-182): the model's list route answer, paged
// and bounded as that route, by flat parameters at the root or one JSON
// parameter named by its path in a type, its count read when asked.
import { Validator } from '@seriousme/openapi-schema-validator'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { Adapter } from 'ultimabase'
import { allow, defineFunction, defineType, memory } from 'ultimabase'
import { rest } from './index.ts'
import type { RestOptions } from './index.ts'
import type { Sent } from './test/app.ts'
import {
	asMaster,
	at,
	call,
	M,
	Post,
	qs,
	seeded,
	started,
	User,
} from './test/app.ts'

const posts = defineFunction({
	name: 'posts',
	query: true,
	use: [rest()],
	input: z.object({ status: z.enum(['draft', 'published']) }),
	output: Post.paginated(),
	run: ({ input, caller }) =>
		Post.paginate(
			{ where: { status: input.status }, orderBy: { title: 'asc' } },
			{ as: caller },
		),
}).with({ access: allow.public, rest: { name: 'paged' } })

const people = defineFunction({
	name: 'people',
	query: true,
	output: User.paginated(),
	run: () => User.paginate({ orderBy: { name: 'asc' } }, M),
}).with({ access: allow.public })

const Profile = defineType({
	name: 'Profile',
	fields: { user: User, posts: Post.paginated() },
})
const profile = defineFunction({
	name: 'profile',
	query: true,
	input: z.object({ name: z.string() }),
	output: defineType({
		name: 'Wrapper',
		fields: { profile: Profile.nullable() },
	}),
	run: async ({ input }) => {
		const user = await User.findUnique({ where: { name: input.name } }, M)
		if (user === null) return { profile: null }
		const where = { author: { is: { id: user.id } } }
		const page = Post.paginate({ where, orderBy: { title: 'desc' } }, M)
		return { profile: { user, posts: page } }
	},
}).with({ access: allow.public })

const wrong = defineFunction({
	name: 'wrong',
	query: true,
	output: Post.paginated(),
	// @ts-expect-error: a page of Post is Post.paginate's.
	run: () => User.paginate({}, M),
}).with({ access: allow.public })

const functions = [posts, people, profile, wrong]

async function serving(
	options: RestOptions,
	test: (
		get: (path: string, params: object, headers?: object) => Promise<Sent>,
	) => Promise<void>,
	database: Adapter = memory(),
): Promise<void> {
	const running = await started(options, database, functions)
	try {
		await seeded()
		await test(async (path, params, headers = {}) =>
			call(running.url, 'GET', `/api/${path}${qs({ ...params })}`, {
				headers: { ...headers },
			}),
		)
	} finally {
		await running.app.stop()
	}
}

function titles(page: unknown): unknown {
	const edges = at(page, 'edges')
	return Array.isArray(edges)
		? edges.map((edge: unknown) => at(edge, 'node', 'title'))
		: undefined
}

type Node = { readonly [key: string]: unknown }
const isNode = (value: unknown): value is Node =>
	typeof value === 'object' && value !== null && !Array.isArray(value)

const refused = (message: string): Sent => ({
	status: 400,
	body: { code: 'BAD_USER_INPUT', message },
})

describe('a function returning a page (D-182)', () => {
	it('answers the model list with the function input', async () => {
		await serving({}, async (get) => {
			const first = await get('functions/paged', {
				status: 'published',
				first: 1,
				totalCount: true,
			})
			expect(first.status).toBe(200)
			expect(titles(first.body)).toStrictEqual(['one'])
			expect(at(first.body, 'pageInfo', 'hasNextPage')).toBe(true)
			expect(at(first.body, 'totalCount')).toBe(2)
			// A row as the model's list returns it: its scalars.
			expect(at(first.body, 'edges', 0, 'node', 'status')).toBe('published')
			expect(at(first.body, 'edges', 0, 'node', 'author')).toBeUndefined()
			const next = await get('functions/paged', {
				status: 'published',
				after: String(at(first.body, 'pageInfo', 'endCursor')),
			})
			expect(titles(next.body)).toStrictEqual(['three'])
			expect(at(next.body, 'totalCount')).toBeUndefined()
			const last = await get('functions/paged', { status: 'draft', last: 1 })
			expect(titles(last.body)).toStrictEqual(['two'])
			expect(at(last.body, 'pageInfo', 'hasPreviousPage')).toBe(true)
		})
	})

	it('pages a type field by one parameter named by its path', async () => {
		await serving({}, async (get) => {
			const read = await get('functions/profile', {
				name: 'ada',
				'profile.posts': { first: 2, totalCount: true },
			})
			expect(at(read.body, 'profile', 'user', 'name')).toBe('ada')
			const page = at(read.body, 'profile', 'posts')
			expect(titles(page)).toStrictEqual(['two', 'three'])
			expect(at(page, 'totalCount')).toBe(3)
			const none = await get('functions/profile', { name: 'eve' })
			expect(none).toStrictEqual({ status: 200, body: { profile: null } })
			expect(
				await get('functions/profile', {
					name: 'ada',
					'profile.posts': { take: 1 },
				}),
			).toStrictEqual({
				status: 400,
				body: {
					code: 'BAD_USER_INPUT',
					message: "Unknown key 'profile.posts.take' on Post.",
					details: { path: 'profile.posts.take' },
				},
			})
			expect(
				await get('functions/profile', { name: 'ada', 'profile.posts': 3 }),
			).toStrictEqual(refused('profile.posts must be an object.'))
			expect(
				await get('functions/profile', {
					name: 'ada',
					'profile.posts': { totalCount: 1 },
				}),
			).toStrictEqual(
				refused('profile.posts.totalCount must be true or false.'),
			)
		})
	})

	it('counts only when asked, once', async () => {
		const base = memory()
		let counts = 0
		const counting: Adapter = {
			...base,
			count: async (read) => {
				counts += 1
				return base.count(read)
			},
		}
		await serving(
			{},
			async (get) => {
				expect((await get('functions/paged', { status: 'draft' })).status).toBe(
					200,
				)
				expect(counts).toBe(0)
				const counted = await get('functions/paged', {
					status: 'draft',
					totalCount: true,
				})
				expect(at(counted.body, 'totalCount')).toBe(2)
				expect(counts).toBe(1)
				expect(
					await get('functions/paged', { status: 'draft', totalCount: 1 }),
				).toStrictEqual(refused('totalCount must be true or false.'))
			},
			counting,
		)
	})

	it('is bounded as the model list route, its count included', async () => {
		await serving({ maxRows: 50 }, async (get) => {
			expect(await get('functions/people', { first: 4 })).toStrictEqual(
				refused('first is at most 3 on User.'),
			)
			const above =
				'The request asks for more than 50 rows. Ask for fewer with first or last.'
			expect(await get('functions/paged', { status: 'draft' })).toStrictEqual(
				refused(above),
			)
			const few = { status: 'draft', first: 10 }
			expect((await get('functions/paged', few)).status).toBe(200)
			expect(
				await get('functions/paged', { ...few, totalCount: true }),
			).toStrictEqual(refused(above))
			expect(
				await get('functions/profile', {
					name: 'ada',
					'profile.posts': { first: 10, totalCount: true },
				}),
			).toStrictEqual(refused(above))
			const master = await get('functions/people', { first: 4 }, asMaster)
			expect(at(master.body, 'edges', 'length')).toBe(2)
		})
	})

	it('is a list of rows with pagination: list, and has no count', async () => {
		await serving({ pagination: 'list' }, async (get) => {
			const read = await get('functions/paged', {
				status: 'published',
				take: 1,
				skip: 1,
			})
			expect(read.status).toBe(200)
			expect(at(read.body, 0, 'title')).toBe('three')
			expect(at(read.body, 'length')).toBe(1)
			const counted = await get('functions/paged', {
				status: 'published',
				totalCount: true,
			})
			expect(counted.status).toBe(400)
		})
	})

	it('refuses a page of another model, and an input named as a page parameter', async () => {
		await serving({}, async (get) => {
			const read = await get('functions/wrong', {})
			expect(read.status).toBe(500)
		})
		const clash = defineFunction({
			name: 'clash',
			query: true,
			input: z.object({ totalCount: z.boolean() }),
			output: Post.paginated(),
			run: () => Post.paginate({}, M),
		}).with({ access: allow.public })
		await expect(started({}, memory(), [clash])).rejects.toThrow(
			'clash: its input property totalCount is a page parameter; rename it.',
		)
		const listed = defineFunction({
			name: 'listed',
			query: true,
			input: z.object({ skip: z.int() }),
			output: Post.paginated(),
			run: () => Post.paginate({}, M),
		}).with({ access: allow.public })
		await expect(
			started({ pagination: 'list' }, memory(), [listed]),
		).rejects.toThrow('listed: its input property skip is a page parameter')
	})

	it('documents the model list answer and the page parameters', async () => {
		const expected = {
			connection: {
				params: ['first', 'after', 'last', 'before', 'totalCount'],
				schema: { $ref: '#/components/schemas/PostConnection' },
			},
			list: {
				params: ['take', 'skip'],
				schema: {
					type: 'array',
					items: { $ref: '#/components/schemas/Post' },
				},
			},
		}
		for (const pagination of ['connection', 'list'] as const) {
			await serving({ pagination }, async (get) => {
				const { body } = await get('openapi.json', {})
				if (!isNode(body)) throw new Error('No document.')
				const result = await new Validator().validate(structuredClone(body))
				expect(result).toEqual({ valid: true })
				const route = (name: string) => at(body, 'paths', `/functions/${name}`)
				const names = (name: string) => {
					const params = at(route(name), 'get', 'parameters')
					return Array.isArray(params)
						? params.map((param: unknown) => at(param, 'name'))
						: []
				}
				const { params, schema } = expected[pagination]
				expect(names('paged')).toEqual(['status', ...params])
				expect(names('people')).toEqual(params)
				expect(names('profile')).toEqual(['name', 'profile.posts'])
				const paged = at(route('paged'), 'get', 'responses', 200, 'content')
				expect(at(paged, 'application/json', 'schema')).toEqual(schema)
			})
		}
	})
})
