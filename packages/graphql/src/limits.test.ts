// What the plugin closes and opens (D-107): the token, depth and row limits,
// introspection and suggestions in production, GraphiQL, and the
// application's middlewares before it.
import { routes } from '@ultimabase/http'
import { getIntrospectionQuery } from 'graphql'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GraphqlOptions } from './index.ts'
import {
	asMaster,
	at,
	M,
	post,
	Post,
	seeded,
	started,
	User,
} from './test/app.ts'

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

describe('a list without first', () => {
	it('returns 100 rows, as D-55 says', async () => {
		await serving({ maxTake: 200 }, async (url) => {
			const ada = await User.create(
				{ data: { name: 'ada', email: 'ada@example.com' } },
				M,
			)
			for (let index = 0; index < 101; index++) {
				await Post.create(
					{
						data: {
							title: `${index}`,
							slug: `${index}`,
							status: 'draft',
							author: { connect: { id: ada.id } },
						},
					},
					M,
				)
			}
			const result = await post(
				url,
				`{ posts { edges { cursor } pageInfo { hasNextPage } } }`,
			)
			expect(at(result.data, 'posts', 'pageInfo', 'hasNextPage')).toBe(true)
			expect(at(result.data, 'posts', 'edges')).toHaveLength(100)
		})
	})
})

describe('the token limit', () => {
	it('refuses a document of more than 2,000 tokens before validating it', async () => {
		await serving({}, async (url) => {
			// Validating 12,000 copies of one field took 6 seconds.
			const repeated = `{ posts { ${'totalCount '.repeat(12_000)}} }`
			const begin = performance.now()
			expect(messages(await post(url, repeated))).toStrictEqual([
				'Syntax Error: Document contains more than 2000 tokens. Parsing aborted.',
			])
			expect(performance.now() - begin).toBeLessThan(1000)
			const longest = `{ posts { ${'totalCount '.repeat(1993)}} }`
			expect((await post(url, longest)).errors).toBeUndefined()
		})
	})
})

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

/** Each post's author's posts: 100 + 100 + 100 × 100 rows by default. */
const nested = (alias: string) =>
	`${alias}: posts { edges { node { author { posts { pageInfo { hasNextPage } } } } } }`

/** A write that returns 10,201 rows: its own, 100 posts, their authors and theirs. */
const create = (alias: string) =>
	`${alias}: createUser(data: { name: "${alias}", email: "${alias}@example.com" }) {
			posts(first: 100) { edges { node { author { posts(first: 100) { pageInfo { hasNextPage } } } } } }
		}`

// Each fragment spreads the previous one twice: 2^n visits for a validator
// that walks a fragment once per path.
function doubling(n: number): string {
	const fragments = ['fragment F0 on __Type { name }']
	for (let index = 1; index <= n; index++) {
		fragments.push(
			`fragment F${index} on __Type { ...F${index - 1} ofType { ...F${index - 1} } }`,
		)
	}
	return `{ __type(name: "Query") { ...F${n} } } ${fragments.join(' ')}`
}

describe('the introspection depth limit', () => {
	it('refuses three nested lists, through fragments too', async () => {
		await serving({}, async (url) => {
			const refused = ['Maximum introspection depth exceeded']
			const three = `{ __schema { types { fields { type { fields { type { fields { name } } } } } } } }`
			expect(messages(await post(url, three))).toStrictEqual(refused)
			const spread = await post(
				url,
				`{ __type(name: "Query") { ...A } }
				fragment A on __Type { fields { type { ...B } } }
				fragment B on __Type { interfaces { fields { name } } }`,
			)
			expect(messages(spread)).toStrictEqual(refused)
			const two = `{ __schema { types { fields { type { fields { name } } } } } }`
			expect((await post(url, two)).errors).toBeUndefined()
		})
	})

	it('measures each fragment once, in production too', async () => {
		vi.stubEnv('NODE_ENV', 'production')
		await serving({}, async (url) => {
			// graphql-js's own rule took 2.4 seconds on these 1.5 KB.
			const document = doubling(24)
			const begin = performance.now()
			const result = await post(url, document)
			expect(messages(result)?.[0]).toContain('introspection has been disabled')
			expect(performance.now() - begin).toBeLessThan(1000)
		})
	})
})

describe('the row budget', () => {
	it('refuses a document that may return more than 20,000 rows, unless Master asks', async () => {
		await serving({}, async (url) => {
			const one = await post(url, `{ ${nested('a')} }`)
			expect(one.errors).toBeUndefined()
			const two = `{ ${nested('a')} ${nested('b')} }`
			expect(messages(await post(url, two))).toStrictEqual([
				'The document asks for more than 20,000 rows. Ask for fewer with first or last.',
			])
			const master = await post(url, two, undefined, asMaster)
			expect(master.errors).toBeUndefined()
			// Refused before it runs: running it would deny the anonymous write.
			const writes = await post(
				url,
				`mutation { ${create('a')} ${create('b')} }`,
			)
			expect(messages(writes)).toStrictEqual([
				'The document asks for more than 20,000 rows. Ask for fewer with first or last.',
			])
		})
	})

	it('counts take for a list without first, with a negative one, or counted', async () => {
		await serving({ maxRows: 150 }, async (url) => {
			const refused = [
				'The document asks for more than 150 rows. Ask for fewer with first or last.',
			]
			const twice = `{ a: posts { totalCount } b: posts { totalCount } }`
			expect(messages(await post(url, twice))).toStrictEqual(refused)
			const negative = `{ a: posts(first: -5) { totalCount } b: posts(last: -5) { totalCount } }`
			expect(messages(await post(url, negative))).toStrictEqual(refused)
			const counts = `{ a: posts(first: 1) { totalCount } b: posts(first: 1) { totalCount } }`
			expect(messages(await post(url, counts))).toStrictEqual(refused)
			const pages = await post(
				url,
				`{ a: posts(first: 1) { edges { cursor } } b: posts(first: 1) { edges { cursor } } }`,
			)
			expect(pages.errors).toBeUndefined()
			const single = `{ user(where: { name: "ada" }) { posts(first: 100) { pageInfo { hasNextPage } } } posts(first: 50) { totalCount } }`
			expect(messages(await post(url, single))).toStrictEqual(refused)
		})
	})

	it('counts a fragment spread twice once, and no skipped or empty list', async () => {
		await serving({ maxRows: 150 }, async (url) => {
			const spread = await post(
				url,
				`{ ...A ...A } fragment A on Query { posts { totalCount } }`,
			)
			expect(spread.errors).toBeUndefined()
			const skipped = await post(
				url,
				`{ a: posts @skip(if: true) { totalCount } b: posts { totalCount } }`,
			)
			expect(skipped.errors).toBeUndefined()
			const empty = await post(
				url,
				`{ a: posts(first: 0) { edges { node { author { posts { pageInfo { hasNextPage } } } } } } b: posts { totalCount } }`,
			)
			expect(empty.errors).toBeUndefined()
		})
	})

	it('counts maxTake for a list asking more, which the list then refuses', async () => {
		await serving({ maxRows: 5 }, async (url) => {
			const result = await post(
				url,
				`{ users(first: 50) { edges { cursor } } }`,
			)
			expect(messages(result)).toStrictEqual(['first is at most 3 on User.'])
		})
	})

	it('names take with pagination: list', async () => {
		await serving({ pagination: 'list', maxRows: 150 }, async (url) => {
			const result = await post(
				url,
				`{ a: posts { title } b: posts { title } }`,
			)
			expect(messages(result)).toStrictEqual([
				'The document asks for more than 150 rows. Ask for fewer with take.',
			])
		})
	})
})

describe('a fragment spread twice at each level', () => {
	it('is read once per level, not once per path', async () => {
		await serving({}, async (url) => {
			await seeded()
			const levels = 20
			const fragments = Array.from(
				{ length: levels },
				(_, index) =>
					`fragment F${index} on Post { ...F${index + 1} ...F${index + 1} }`,
			).join(' ')
			const result = await post(
				url,
				`{ posts(first: 1) { edges { node { ...F0 } } } } ${fragments}
				fragment F${levels} on Post { title }`,
			)
			expect(result.errors).toBeUndefined()
			expect(at(result.data, 'posts', 'edges', 0, 'node', 'title')).toBeTypeOf(
				'string',
			)
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
	it('logs where GraphiQL is, but not in production', async () => {
		const running = await started({ path: '/api' })
		await running.app.stop()
		expect(running.lines).toContainEqual({
			level: 'info',
			first: `GraphiQL on ${running.url}/api.`,
		})
		vi.stubEnv('NODE_ENV', 'production')
		const quiet = await started()
		await quiet.app.stop()
		const graphiql = quiet.lines.filter((line) =>
			String(line.first).startsWith('GraphiQL'),
		)
		expect(graphiql).toStrictEqual([])
	})

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

describe('a middleware of the application', () => {
	it('may read the body before the document runs', async () => {
		const reading = routes().use(async (c, next) => {
			if (c.req.method === 'POST') await c.req.json()
			await next()
		})
		const running = await started({}, undefined, [reading])
		try {
			const result = await post(`${running.url}/graphql`, `{ __typename }`)
			expect(result).toStrictEqual({ data: { __typename: 'Query' } })
		} finally {
			await running.app.stop()
		}
	})
})
