// A relation or a virtual selected twice with different arguments (D-185):
// refused as the document is validated, aliases and fragments included,
// before a query, a mutation or a subscription runs.
import { httpPlugin } from '@ultimabase/http'
import { realtime, realtimePlugin } from '@ultimabase/realtime'
import type { GraphQLSchema } from 'graphql'
import { assertObjectType, extendSchema, parse } from 'graphql'
import { createClient } from 'graphql-ws'
import type { Logger } from 'ultimabase'
import { allow, defineApp, defineModel, master, memory } from 'ultimabase'
import { describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import { z } from 'zod'
import type { GraphqlContext } from './index.ts'
import { graphql, graphqlPlugin } from './index.ts'
import { asMaster, at, post } from './test/app.ts'

const M = { as: master }

const Post = defineModel({
	name: 'Post',
	use: [graphql(), realtime()],
	fields: (f) => ({
		title: f.string(),
		comments: f.many(() => Comment, { inverse: 'post' }),
		thumb: f.virtual(z.string(), {
			input: z.object({ size: z.int().positive() }),
			needs: ['title'],
		}),
	}),
}).with({
	access: allow.public,
	virtuals: {
		thumb: { run: ({ input, record }) => `${record.title}@${input.size}` },
	},
})

const Comment = defineModel({
	name: 'Comment',
	use: [graphql()],
	fields: (f) => ({ body: f.string(), post: f.one(() => Post) }),
}).with({ access: allow.public })

/** `Post.related`, a field `extend` adds: every post, read as asked. */
function relating(schema: GraphQLSchema): GraphQLSchema {
	const extended = extendSchema(
		schema,
		parse(`extend type Post { related: [Post!]! }`),
	)
	const related = assertObjectType(extended.getType('Post')).getFields()[
		'related'
	]
	if (related) {
		related.resolve = (_, __, context: GraphqlContext, info) =>
			Post.findMany({ select: context.select(info) }, { as: context.caller })
	}
	return extended
}

let listening = ''
const logger: Logger = {
	info: (first: string | object) => {
		if (typeof first === 'string' && first.startsWith('Listening on')) {
			listening = first.replace(/^Listening on (.*)\.$/, '$1')
		}
	},
	warn: () => undefined,
	error: () => undefined,
	child: () => logger,
}

/** Runs `check` against an application of these models, seeded. */
async function serving(check: (url: string) => Promise<void>): Promise<void> {
	const app = defineApp({
		database: memory(),
		plugins: [
			httpPlugin({ port: 0 }),
			realtimePlugin(),
			graphqlPlugin({ extend: relating }),
		],
		models: [Post, Comment],
		masterKey: 'secret',
		logger,
	})
	await app.start()
	try {
		const first = await Post.create({ data: { title: 'one' } }, M)
		for (const body of ['a', 'b', 'c']) {
			await Comment.create(
				{ data: { body, post: { connect: { id: first.id } } } },
				M,
			)
		}
		await check(`${listening}/graphql`)
	} finally {
		await app.stop()
	}
}

const messages = (result: { errors?: readonly { message: string }[] }) =>
	result.errors?.map((error) => error.message)

const twice = (name: string, first: string, other: string): string[] => [
	`${name} is selected twice with different arguments, at ${first} and ${other}; read it once.`,
]

describe('a relation selected twice', () => {
	it('is refused through fragments, naming both paths', async () => {
		await serving(async (url) => {
			const result = await post(
				url,
				`{ posts { edges { node { ...PostCard } } } }
				fragment PostCard on Post {
					commenterIds: comments { edges { node { post { id } } } }
					...PostFooter
				}
				fragment PostFooter on Post {
					comments(first: 3) { totalCount edges { node { id body } } }
				}`,
			)
			expect(messages(result)).toStrictEqual(
				twice(
					'comments',
					'posts.edges.node.commenterIds',
					'posts.edges.node.comments',
				),
			)
			expect(result.data).toBeUndefined()
		})
	})

	it('is read once with the same arguments, in any order', async () => {
		await serving(async (url) => {
			const result = await post(
				url,
				`query ($first: Int) { posts(first: 1) { edges { node {
					a: comments(first: $first, where: { body: { contains: "a" }, NOT: { body: { equals: "b" } } }) { totalCount }
					b: comments(where: { NOT: { body: { equals: "b" } }, body: { contains: "a" } }, first: $first) { totalCount }
					...Card ...Card
				} } } }
				fragment Card on Post { ... { a: comments(first: $first, where: { body: { contains: "a" }, NOT: { body: { equals: "b" } } }) { totalCount } } }`,
				{ first: 2 },
			)
			expect(result.errors).toBeUndefined()
			expect(at(result.data, 'posts', 'edges', 0, 'node')).toStrictEqual({
				a: { totalCount: 1 },
				b: { totalCount: 1 },
			})
		})
	})

	it('is refused with two variables, even of one value', async () => {
		await serving(async (url) => {
			const result = await post(
				url,
				`query ($a: Int, $b: Int) { posts { edges { node {
					x: comments(first: $a) { totalCount }
					y: comments(first: $b) { totalCount }
				} } } }`,
				{ a: 1, b: 1 },
			)
			expect(messages(result)).toStrictEqual(
				twice('comments', 'posts.edges.node.x', 'posts.edges.node.y'),
			)
		})
	})

	it('is refused under two aliases of one relation', async () => {
		await serving(async (url) => {
			const result = await post(
				url,
				`{ comments { edges { node {
					a: post { comments(first: 1) { totalCount } }
					b: post { comments(first: 2) { totalCount } }
				} } } }`,
			)
			expect(messages(result)).toStrictEqual(
				twice(
					'comments',
					'comments.edges.node.a.comments',
					'comments.edges.node.b.comments',
				),
			)
		})
	})

	it('is refused for a virtual with an input', async () => {
		await serving(async (url) => {
			const result = await post(
				url,
				`{ posts { edges { node { a: thumb(size: 1) b: thumb(size: 2) } } } }`,
			)
			expect(messages(result)).toStrictEqual(
				twice('thumb', 'posts.edges.node.a', 'posts.edges.node.b'),
			)
		})
	})

	it('is refused in a mutation, which then creates nothing, and for Master', async () => {
		await serving(async (url) => {
			const created = `mutation { createPost(data: { title: "two" }) {
				a: comments(first: 1) { totalCount }
				b: comments(first: 2) { totalCount }
			} }`
			const expected = twice('comments', 'createPost.a', 'createPost.b')
			expect(messages(await post(url, created))).toStrictEqual(expected)
			expect(
				messages(await post(url, created, undefined, asMaster)),
			).toStrictEqual(expected)
			expect(await Post.count({}, M)).toBe(1)
		})
	})

	it('leaves two arguments under one path to graphql-js', async () => {
		await serving(async (url) => {
			const result = await post(
				url,
				`{ posts { edges { node {
					comments(first: 1) { totalCount }
					comments(first: 2) { totalCount }
				} } } }`,
			)
			expect(messages(result)).toStrictEqual([
				'Fields "comments" conflict because they have differing arguments. Use different aliases on the fields to fetch both if this was intentional.',
			])
		})
	})
})

describe('what resolves once per alias', () => {
	it('reads a root field or a field extend adds with other arguments below', async () => {
		await serving(async (url) => {
			const result = await post(
				url,
				`{
					a: posts { edges { node { comments(first: 1) { totalCount } } } }
					b: posts { edges { node { comments(first: 2) { totalCount } } } }
					posts { edges { node {
						x: related { comments(first: 1) { edges { node { body } } } }
						y: related { comments(first: 2) { edges { node { body } } } }
						nope
					} } }
				}`,
			)
			expect(messages(result)).toStrictEqual([
				'Cannot query field "nope" on type "Post".',
			])
			const read = await post(
				url,
				`{ posts { edges { node {
					x: related { comments(first: 1) { edges { node { body } } } }
					y: related { comments(first: 2) { edges { node { body } } } }
				} } } }`,
			)
			expect(read.errors).toBeUndefined()
			const node = at(read.data, 'posts', 'edges', 0, 'node')
			expect(at(node, 'x', 0, 'comments', 'edges')).toHaveLength(1)
			expect(at(node, 'y', 0, 'comments', 'edges')).toHaveLength(2)
		})
	})
})

describe('a subscription over WebSocket', () => {
	it('is refused by the same rule', async () => {
		await serving(async (url) => {
			const client = createClient({
				url: url.replace(/^http/, 'ws'),
				webSocketImpl: WebSocket,
				retryAttempts: 0,
			})
			try {
				const results = client.iterate({
					query: `subscription { posts { edges { node {
						a: comments(first: 1) { totalCount }
						b: comments(first: 2) { totalCount }
					} } } }`,
				})
				const refused = await results.next().then(
					() => undefined,
					(error: unknown) => error,
				)
				const [message] = twice(
					'comments',
					'posts.edges.node.a',
					'posts.edges.node.b',
				)
				expect(refused).toStrictEqual([expect.objectContaining({ message })])
			} finally {
				await client.dispose()
			}
		})
	})
})
