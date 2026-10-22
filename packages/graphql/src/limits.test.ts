// What the plugin closes and opens (D-107): the depth limit, introspection
// and suggestions in production, GraphiQL, and `extend`.
import type { GraphQLFieldConfigMap } from 'graphql'
import {
	getIntrospectionQuery,
	GraphQLObjectType,
	GraphQLSchema,
	GraphQLString,
} from 'graphql'
import type { Caller } from 'ultimabase'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GraphqlOptions } from './index.ts'
import { asMaster, post, seeded, started } from './test/app.ts'

afterEach(() => {
	vi.unstubAllEnvs()
})

/** Runs `check` against an application started with `options`. */
async function serving(
	options: GraphqlOptions,
	check: (url: string) => Promise<void>,
): Promise<void> {
	const running = await started(options)
	try {
		await check(`${running.url}${options.path ?? '/graphql'}`)
	} finally {
		await running.app.stop()
	}
}

const messages = (result: { errors?: readonly { message: string }[] }) =>
	result.errors?.map((error) => error.message)

describe('the depth limit', () => {
	it('refuses a document deeper than maxDepth, unless Master asks', async () => {
		await serving({ maxDepth: 3 }, async (url) => {
			const deep = `{ users { edges { node { name } } } }`
			expect(messages(await post(url, deep))).toStrictEqual([
				'The document is nested 4 levels deep; the most is 3.',
			])
			const master = await post(url, deep, undefined, asMaster)
			expect(master.errors).toBeUndefined()
			const fragments = await post(
				url,
				`{ ...Root } fragment Root on Query {
					users { ... on UserConnection { edges { ...Edge } } }
				}
				fragment Edge on UserEdge { node { name } }`,
			)
			expect(messages(fragments)).toStrictEqual([
				'The document is nested 4 levels deep; the most is 3.',
			])
			const shallow = await post(url, `{ users { edges { cursor } } }`)
			expect(shallow.errors).toBeUndefined()
		})
	})

	it('does not count introspection', async () => {
		await serving({ maxDepth: 3 }, async (url) => {
			const result = await post(url, getIntrospectionQuery())
			expect(result.errors).toBeUndefined()
		})
	})

	it('measures a fragment cycle or a missing fragment without looping', async () => {
		await serving({}, async (url) => {
			const cycle = await post(
				url,
				`{ ...A } fragment A on Query { ...B } fragment B on Query { ...A }`,
			)
			expect(messages(cycle)?.[0]).toContain('Cannot spread fragment "A"')
			const missing = await post(url, `{ ...Missing }`)
			expect(messages(missing)).toStrictEqual(['Unknown fragment "Missing".'])
		})
	})
})

describe('in production', () => {
	it('closes introspection and suggestions', async () => {
		vi.stubEnv('NODE_ENV', 'production')
		await serving({}, async (url) => {
			await seeded()
			const schema = await post(url, `{ __schema { types { name } } }`)
			expect(messages(schema)?.[0]).toContain('introspection has been disabled')
			const typo = await post(url, `{ usr(where: { name: "ada" }) { id } }`)
			expect(messages(typo)).toStrictEqual([
				'Cannot query field "usr" on type "Query".',
			])
			const value = await post(
				url,
				`query ($s: PostStatus!) { posts(where: { status: { equals: $s } }) { totalCount } }`,
				{ s: 'publishd' },
			)
			expect(messages(value)?.[0]).not.toContain('Did you mean')
			const page = await fetch(url, { headers: { accept: 'text/html' } })
			// graphql-http answers a GET it cannot serve as JSON.
			expect(page.status).toBe(406)
		})
	})

	it('reopens both with introspection: true', async () => {
		vi.stubEnv('NODE_ENV', 'production')
		await serving({ introspection: true }, async (url) => {
			const schema = await post(url, `{ __schema { queryType { name } } }`)
			expect(schema).toStrictEqual({
				data: { __schema: { queryType: { name: 'Query' } } },
			})
			const typo = await post(url, `{ usr(where: { name: "ada" }) { id } }`)
			expect(messages(typo)?.[0]).toContain('Did you mean "user"')
		})
	})
})

describe('outside production', () => {
	it('serves GraphiQL to a browser, at the path given', async () => {
		await serving({ path: '/api' }, async (url) => {
			const page = await fetch(url, {
				headers: { accept: 'text/html,application/xhtml+xml,*/*;q=0.8' },
			})
			expect(page.status).toBe(200)
			expect(page.headers.get('content-type')).toBe('text/html; charset=utf-8')
			const html = await page.text()
			expect(html).toContain('https://esm.sh/graphiql@5.4.0')
			expect(html).toContain('createGraphiQLFetcher({ url: "/api" })')
			const typo = await post(url, `{ usr(where: { name: "ada" }) { id } }`)
			expect(messages(typo)?.[0]).toContain('Did you mean "user"')
			const value = await post(
				url,
				`query ($s: PostStatus!) { posts(where: { status: { equals: $s } }) { totalCount } }`,
				{ s: 'publishd' },
			)
			expect(messages(value)?.[0]).toContain('Did you mean the enum value')
		})
	})
})

/** Adds `me`, the caller's kind, to the generated schema. */
const extend = (schema: GraphQLSchema): GraphQLSchema => {
	const config = schema.toConfig()
	const query = schema.getQueryType()?.toConfig()
	const me: GraphQLFieldConfigMap<unknown, { caller: Caller }> = {
		me: {
			type: GraphQLString,
			resolve: (_, __, context) => context.caller.kind,
		},
	}
	return new GraphQLSchema({
		...config,
		query: new GraphQLObjectType({
			name: 'Query',
			fields: { ...query?.fields, ...me },
		}),
		types: config.types.filter((type) => type.name !== 'Query'),
	})
}

describe('extend', () => {
	it('replaces the schema with the one built from it', async () => {
		await serving({ extend }, async (url) => {
			const result = await post(url, `{ me users { totalCount } }`)
			expect(result).toStrictEqual({
				data: { me: 'anonymous', users: { totalCount: 0 } },
			})
		})
	})
})
