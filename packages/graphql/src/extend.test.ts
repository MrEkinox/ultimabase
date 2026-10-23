// What `extend` adds (D-107): fields run with the request's context, whose
// `context.select(info)` reads what the client asks, relations included.
import type { GraphQLFieldConfigMap } from 'graphql'
import {
	assertObjectType,
	GraphQLList,
	GraphQLNonNull,
	GraphQLObjectType,
	GraphQLSchema,
	GraphQLString,
} from 'graphql'
import { describe, expect, it } from 'vitest'
import type { GraphqlContext } from './index.ts'
import { asMaster, post, Post, seeded, started, User } from './test/app.ts'

type Added = GraphQLFieldConfigMap<unknown, GraphqlContext>

/** The generated schema, its query given `fields`. */
const adding =
	(fields: (schema: GraphQLSchema) => Added) =>
	(schema: GraphQLSchema): GraphQLSchema => {
		const config = schema.toConfig()
		return new GraphQLSchema({
			...config,
			query: new GraphQLObjectType({
				name: 'Query',
				fields: {
					...schema.getQueryType()?.toConfig().fields,
					...fields(schema),
				},
			}),
			types: config.types.filter((type) => type.name !== 'Query'),
		})
	}

const listOf = (schema: GraphQLSchema, name: string) =>
	new GraphQLNonNull(
		new GraphQLList(new GraphQLNonNull(assertObjectType(schema.getType(name)))),
	)

const extend = adding((schema) => ({
	me: {
		type: GraphQLString,
		resolve: (_, __, context) => context.caller.kind,
	},
	published: {
		type: listOf(schema, 'Post'),
		resolve: (_, __, context, info) =>
			Post.findMany(
				{
					where: { status: 'published' },
					select: { ...context.select(info), status: true },
					orderBy: { title: 'asc' },
				},
				{ as: context.caller },
			),
	},
	unread: {
		type: listOf(schema, 'Post'),
		resolve: (_, __, context) => Post.findMany({}, { as: context.caller }),
	},
	authors: {
		type: listOf(schema, 'User'),
		resolve: (_, __, context) => User.findMany({}, { as: context.caller }),
	},
	feed: {
		type: assertObjectType(schema.getType('PostConnection')),
		resolve: (_, __, context, info) => context.select(info),
	},
}))

/** Runs `check` against an application with the fields above. */
async function serving(
	check: (url: string, logged: () => unknown[]) => Promise<void>,
): Promise<void> {
	const running = await started({ extend })
	try {
		await seeded()
		const logged = () =>
			running.lines.map((line): unknown =>
				Reflect.get(Object(line.first), 'err'),
			)
		await check(`${running.url}/graphql`, logged)
	} finally {
		await running.app.stop()
	}
}

const failed = (message: string): unknown =>
	expect.arrayContaining([expect.objectContaining({ message })])

describe('a field extend adds', () => {
	it('receives the caller, and reads what the client asks', async () => {
		await serving(async (url) => {
			const result = await post(
				url,
				`{ me published { title author { name
					posts(first: 2, orderBy: [{ slug: asc }]) { edges { node { slug } } }
				} } }`,
			)
			const author = {
				name: 'ada',
				posts: {
					edges: [{ node: { slug: 'one' } }, { node: { slug: 'three' } }],
				},
			}
			expect(result).toStrictEqual({
				data: {
					me: 'anonymous',
					published: [
						{ title: 'one', author },
						{ title: 'three', author },
					],
				},
			})
		})
	})

	it('limits the pages it reads as its caller', async () => {
		await serving(async (url) => {
			const document = `{ published { author { posts(first: 101) { edges { cursor } } } } }`
			const anonymous = await post(url, document)
			expect(anonymous.errors).toStrictEqual(
				failed('first is at most 100 on Post.'),
			)
			expect(anonymous.data).toBeNull()
			const master = await post(url, document, undefined, asMaster)
			expect(master.errors).toBeUndefined()
		})
	})

	it('logs a relation its rows did not read, naming the fix', async () => {
		await serving(async (url, logged) => {
			const one = await post(url, `{ unread { author { name } } }`)
			const many = await post(url, `{ authors { posts { edges { cursor } } } }`)
			expect([one.errors?.[0]?.message, many.errors?.[0]?.message]).toEqual([
				'Internal error.',
				'Internal error.',
			])
			expect(logged()).toStrictEqual(
				expect.arrayContaining([
					new Error(
						'Post.author was not read; select it with context.select(info).',
					),
					new Error(
						'User.posts was not read; select it with context.select(info).',
					),
				]),
			)
		})
	})

	it('logs context.select on a field that returns no model', async () => {
		await serving(async (url, logged) => {
			const result = await post(url, `{ feed { pageInfo { hasNextPage } } }`)
			expect(result.errors?.[0]?.message).toBe('Internal error.')
			expect(logged()).toContainEqual(
				new Error(
					"context.select(info) reads a model's rows; Query.feed returns PostConnection.",
				),
			)
		})
	})
})
