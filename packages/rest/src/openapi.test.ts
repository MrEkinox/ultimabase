// The OpenAPI document (D-144): a valid OpenAPI 3.1 document, public, whose
// schemas accept what REST takes and answers, named as GraphQL names them,
// and the name clashes refused at start.
import { Validator } from '@seriousme/openapi-schema-validator'
import { Ajv2020 } from 'ajv/dist/2020.js'
import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
	allow,
	defineFunction,
	defineModel,
	defineType,
	memory,
} from 'ultimabase'
import type { RestOptions } from './index.ts'
import { rest } from './index.ts'
import {
	asMaster,
	at,
	call,
	Post,
	qs,
	seeded,
	started,
	Tag,
	User,
} from './test/app.ts'
import { Secret } from './test/app.ts'

const Isbn = z
	.object({ code: z.string(), year: z.int().optional() })
	.meta({ id: 'Isbn' })

const Writer = defineModel({
	name: 'Writer',
	use: [rest()],
	fields: (f) => ({
		name: f.string({ unique: true }),
		books: f.many(() => Book),
	}),
}).with({ access: allow.public })

const Book = defineModel({
	name: 'Book',
	use: [rest()],
	fields: (f) => ({
		title: f.string({ search: true }),
		status: f.enumOf(['draft', 'out']),
		pages: f.number({ integer: true, optional: true }),
		price: f.decimal({ precision: 6, scale: 2, optional: true }),
		isbn: f.json({ optional: true, validate: Isbn }),
		notes: f.string({ list: true }),
		writer: f.one(() => Writer, { optional: true }),
	}),
	indexes: [{ fields: ['writer', 'title'], unique: true }],
}).with({ access: allow.public })

const Greeting = z.object({ text: z.string(), isbn: Isbn.optional() })

const greet = defineFunction({
	name: 'greet',
	input: z.object({ name: z.string(), isbn: Isbn.optional() }),
	output: Greeting,
	run: ({ input }) => ({ text: `Hello ${input.name}`, isbn: input.isbn }),
}).with({ access: allow.public })

const find = defineFunction({
	name: 'find',
	query: true,
	input: z.object({ q: z.string(), limit: z.int().optional() }),
	output: [Book],
	run: async ({ input }) =>
		Book.findMany({
			where: { title: { contains: input.q } },
			take: input.limit,
		}),
}).with({ access: allow.public })

const Shelf = defineType({
	name: 'Shelf',
	fields: { top: Book.nullable(), books: [Book], label: z.string() },
})
const shelf = defineFunction({
	name: 'shelf',
	query: true,
	output: Shelf,
	run: async () => ({ top: null, books: await Book.findMany({}), label: 's' }),
}).with({ access: allow.public })

const echo = defineFunction({
	name: 'echo',
	query: true,
	input: z.string(),
	output: z.string(),
	run: ({ input }) => input,
}).with({ access: allow.public })

const ping = defineFunction({
	name: 'ping',
	run: () => undefined,
}).with({ access: allow.public })

type Branch = { readonly name: string; readonly children: readonly Branch[] }
const Branch: z.ZodType<Branch> = z.object({
	name: z.string(),
	get children() {
		return z.array(Branch)
	},
})
const tree = defineFunction({
	name: 'tree',
	query: true,
	output: Branch,
	run: () => ({ name: 'a', children: [{ name: 'b', children: [] }] }),
}).with({ access: allow.public })

const functions = [greet, find, shelf, echo, ping, tree]
const models = [User, Post, Tag, Secret, Writer, Book]

let stop: (() => Promise<void>) | undefined
afterEach(async () => {
	await stop?.()
	stop = undefined
})

type Node = { readonly [key: string]: unknown }
const isNode = (value: unknown): value is Node =>
	typeof value === 'object' && value !== null && !Array.isArray(value)

async function serving(options: RestOptions = {}) {
	const running = await started(options, memory(), functions, models)
	stop = async () => running.app.stop()
	const { status, body } = await call(running.url, 'GET', '/api/openapi.json')
	expect(status).toBe(200)
	if (!isNode(body)) throw new Error('No document.')
	return { url: running.url, document: body }
}

/** Whether `value` is of the schema at `path` of the document. */
function checker(document: Node) {
	const ajv = new Ajv2020({ strict: false, validateFormats: false })
	return (value: unknown, ...path: readonly (string | number)[]): unknown => {
		const schema = at(document, ...path)
		if (!isNode(schema)) throw new Error(`No schema at ${path.join('.')}.`)
		const validate = ajv.compile({
			...schema,
			components: document['components'],
		})
		return validate(value) ? true : validate.errors
	}
}

const answer = (path: string, method: string, status: number | string) =>
	[
		'paths',
		path,
		method,
		'responses',
		status,
		'content',
		'application/json',
		'schema',
	] as const

const body = (path: string, method: string) =>
	[
		'paths',
		path,
		method,
		'requestBody',
		'content',
		'application/json',
		'schema',
	] as const

describe('the document', () => {
	it('is a valid OpenAPI 3.1 document, served to anyone', async () => {
		for (const pagination of ['connection', 'list'] as const) {
			const { document } = await serving({ pagination })
			const result = await new Validator().validate(structuredClone(document))
			expect(result).toEqual({ valid: true })
			await stop?.()
			stop = undefined
		}
	})

	it('serves no path of a hidden model, but its rows', async () => {
		const { document } = await serving()
		expect(Object.keys(at(document, 'paths') ?? {})).toEqual([
			'/users',
			'/users/{id}',
			'/posts',
			'/posts/{id}',
			'/secrets',
			'/secrets/{id}',
			'/writers',
			'/writers/{id}',
			'/books',
			'/books/{id}',
			'/functions/greet',
			'/functions/find',
			'/functions/shelf',
			'/functions/echo',
			'/functions/ping',
			'/functions/tree',
		])
		expect(at(document, 'components', 'schemas', 'Tag')).toBeDefined()
		expect(at(document, 'servers')).toEqual([{ url: '/api' }])
	})

	it('names the schemas as GraphQL names its types', async () => {
		const { document } = await serving()
		const names = Object.keys(at(document, 'components', 'schemas') ?? {})
		expect(names).toEqual(
			expect.arrayContaining([
				'Error',
				'Book',
				'BookConnection',
				'BookEdge',
				'PageInfo',
				'BookStatus',
				'BookWhereInput',
				'BookOrderByInput',
				'BookWhereUniqueInput',
				'BookCreateInput',
				'BookUpdateInput',
				'BookSelect',
				'BookInclude',
				'BookListArgs',
				'WriterArgs',
				'WriterCreateNestedOneWithoutBooksInput',
				'BookUpdateManyWithoutWriterNestedInput',
				'StringFilter',
				'StringListFilter',
				'JSONFilter',
				'DecimalFilter',
				'Isbn',
				'IsbnInput',
				'Shelf',
			]),
		)
		expect(
			at(document, 'components', 'schemas', 'Book', 'properties', 'price'),
		).toEqual({
			anyOf: [
				{ type: 'string', pattern: '^-?\\d+(\\.\\d+)?$' },
				{ type: 'null' },
			],
		})
		expect(
			Object.keys(
				at(document, 'components', 'schemas', 'DecimalFilter', 'properties') ??
					{},
			),
		).toEqual(['equals', 'not', 'in', 'notIn', 'lt', 'lte', 'gt', 'gte'])
		// A typed json field filters with JSONFilter, at a path or not (D-149).
		expect(names).not.toContain('BookIsbnFilter')
		expect(
			at(
				document,
				'components',
				'schemas',
				'BookWhereInput',
				'properties',
				'isbn',
			),
		).toEqual({ $ref: '#/components/schemas/JSONFilter' })
		expect(at(document, 'components', 'schemas', 'Isbn')).toEqual({
			type: 'object',
			properties: {
				code: { type: 'string' },
				year: {
					type: 'integer',
					minimum: -9007199254740991,
					maximum: 9007199254740991,
				},
			},
			required: ['code'],
			additionalProperties: false,
		})
		const properties = (name: string) =>
			Object.keys(
				at(document, 'components', 'schemas', name, 'properties') ?? {},
			)
		expect(properties('BookWhereInput')).toContain('_search')
		expect(properties('BookOrderByInput')).toContain('_relevance')
		expect(properties('WriterWhereInput')).not.toContain('_search')
		expect(properties('WriterOrderByInput')).not.toContain('_relevance')
		expect(at(document, 'paths', '/books', 'get', 'operationId')).toBe('books')
		expect(at(document, 'paths', '/books/{id}', 'get', 'operationId')).toBe(
			'book',
		)
		expect(
			at(document, 'paths', '/functions/ping', 'post', 'operationId'),
		).toBe('ping')
	})

	it('takes a query function input as its parameters', async () => {
		const { document } = await serving()
		expect(
			at(document, 'paths', '/functions/find', 'get', 'parameters'),
		).toEqual([
			{ name: 'q', in: 'query', required: true, schema: { type: 'string' } },
			{
				name: 'limit',
				in: 'query',
				content: {
					'application/json': {
						schema: {
							type: 'integer',
							minimum: -9007199254740991,
							maximum: 9007199254740991,
						},
					},
				},
			},
		])
		expect(
			at(document, 'paths', '/functions/echo', 'get', 'parameters'),
		).toEqual([
			{
				name: 'input',
				in: 'query',
				required: true,
				schema: { type: 'string' },
			},
		])
	})
})

describe('its schemas', () => {
	it('accept what REST takes and answers', async () => {
		const { url, document } = await serving()
		const check = checker(document)
		const sent = {
			title: 'a',
			status: 'draft',
			pages: 10,
			price: '012.5',
			isbn: { code: 'x' },
			notes: ['n'],
			writer: { create: { name: 'w' } },
		}
		expect(check(sent, ...body('/books', 'post'))).toBe(true)
		const listFilter = ['components', 'schemas', 'StringListFilter']
		expect(check({ hasEvery: ['n'], isEmpty: false }, ...listFilter)).toBe(true)
		expect(check({ isEmpty: 'no' }, ...listFilter)).not.toBe(true)
		const jsonFilter = ['components', 'schemas', 'JSONFilter']
		const path = { path: ['code'], stringContains: 'x', mode: 'insensitive' }
		expect(check(path, ...jsonFilter)).toBe(true)
		expect(check({ path: 'code', equals: 'x' }, ...jsonFilter)).not.toBe(true)
		expect(check({ path: [], stringEndsWith: 1 }, ...jsonFilter)).not.toBe(true)
		expect(check({ ...sent, price: 12.5 }, ...body('/books', 'post'))).not.toBe(
			true,
		)
		const created = await call(url, 'POST', '/api/books', { body: sent })
		expect(created.status).toBe(201)
		expect(at(created.body, 'price')).toBe('12.50')
		expect(check(created.body, ...answer('/books', 'post', 201))).toBe(true)
		const id = String(at(created.body, 'id'))
		const writer = await call(
			url,
			'GET',
			`/api/writers${qs({ include: { books: { first: 1 } } })}`,
		)
		expect(check(writer.body, ...answer('/writers', 'get', 200))).toBe(true)
		const writerId = String(at(writer.body, 'edges', 0, 'node', 'id'))

		const upsert = (title: string) => ({
			where: { writer: writerId, title },
			create: { title, status: 'out', writer: { connect: { id: writerId } } },
			update: { pages: null, notes: ['m'] },
		})
		for (const [title, status] of [
			['a', 200],
			['b', 201],
		] as const) {
			expect(check(upsert(title), ...body('/books', 'put'))).toBe(true)
			const put = await call(url, 'PUT', '/api/books', { body: upsert(title) })
			expect(put.status).toBe(status)
			expect(check(put.body, ...answer('/books', 'put', status))).toBe(true)
		}

		const update = { title: 'c', writer: { disconnect: true } }
		expect(check(update, ...body('/books/{id}', 'patch'))).toBe(true)
		const patched = await call(url, 'PATCH', `/api/books/${id}`, {
			body: update,
		})
		expect(check(patched.body, ...answer('/books/{id}', 'patch', 200))).toBe(
			true,
		)
		const list = await call(
			url,
			'GET',
			`/api/books${qs({ include: { writer: true }, totalCount: true, first: 1 })}`,
		)
		expect(check(list.body, ...answer('/books', 'get', 200))).toBe(true)
		const searched = await call(
			url,
			'GET',
			`/api/books${qs({ where: { _search: 'c' }, orderBy: { _relevance: 'desc' }, select: { title: true } })}`,
		)
		expect(at(searched.body, 'edges', 0, 'node')).toEqual({ title: 'c' })
		expect(at(searched.body, 'edges', 1)).toBeUndefined()
		const coded = await call(
			url,
			'GET',
			`/api/books${qs({ where: { isbn: { path: ['code'], equals: 'x' } }, select: { title: true } })}`,
		)
		expect(at(coded.body, 'edges', 0, 'node')).toEqual({ title: 'c' })
		expect(at(coded.body, 'edges', 1)).toBeUndefined()
		const one = await call(
			url,
			'GET',
			`/api/books/${id}${qs({ select: { title: true } })}`,
		)
		// The row's fields are those a read returns without `select`.
		expect(check(one.body, ...answer('/books/{id}', 'get', 200))).not.toBe(true)
		const full = await call(url, 'GET', `/api/books/${id}`)
		expect(check(full.body, ...answer('/books/{id}', 'get', 200))).toBe(true)
		const deleted = await call(url, 'DELETE', `/api/books/${id}`)
		expect(check(deleted.body, ...answer('/books/{id}', 'delete', 200))).toBe(
			true,
		)
		const missing = await call(url, 'GET', `/api/books/${id}`)
		expect(missing.status).toBe(404)
		expect(
			check(missing.body, ...answer('/books/{id}', 'get', 'default')),
		).toBe(true)
	})

	it('accept the rows a caller reads, a ruled field as null', async () => {
		const { url, document } = await serving({ pagination: 'list' })
		await seeded()
		const check = checker(document)
		const users = await call(
			url,
			'GET',
			`/api/users${qs({ include: { posts: true } })}`,
		)
		expect(at(users.body, 0, 'email')).toBeNull()
		expect(check(users.body, ...answer('/users', 'get', 200))).toBe(true)
		const posts = await call(
			url,
			'GET',
			`/api/posts${qs({ include: { tags: true, author: true } })}`,
			{
				headers: asMaster,
			},
		)
		expect(check(posts.body, ...answer('/posts', 'get', 200))).toBe(true)
	})

	it('accept what the functions take and answer', async () => {
		const { url, document } = await serving()
		const check = checker(document)
		await call(url, 'POST', '/api/books', {
			body: { title: 'a', status: 'out' },
		})
		const given = { name: 'ada', isbn: { code: 'x' } }
		expect(check(given, ...body('/functions/greet', 'post'))).toBe(true)
		const greeted = await call(url, 'POST', '/api/functions/greet', {
			body: given,
		})
		expect(
			check(greeted.body, ...answer('/functions/greet', 'post', 200)),
		).toBe(true)
		const found = await call(
			url,
			'GET',
			`/api/functions/find${qs({ q: 'a', limit: 1 })}`,
		)
		expect(at(found.body, 0, 'title')).toBe('a')
		expect(check(found.body, ...answer('/functions/find', 'get', 200))).toBe(
			true,
		)
		const shelved = await call(url, 'GET', '/api/functions/shelf')
		expect(check(shelved.body, ...answer('/functions/shelf', 'get', 200))).toBe(
			true,
		)
		const echoed = await call(
			url,
			'GET',
			`/api/functions/echo${qs({ input: 'hi' })}`,
		)
		expect(check(echoed.body, ...answer('/functions/echo', 'get', 200))).toBe(
			true,
		)
		const pinged = await call(url, 'POST', '/api/functions/ping')
		expect(pinged.body).toBe(true)
		expect(check(pinged.body, ...answer('/functions/ping', 'post', 200))).toBe(
			true,
		)
		expect(
			at(document, 'paths', '/functions/ping', 'post', 'requestBody'),
		).toBeUndefined()
	})
})

const refusing = (
	given: Parameters<typeof started>[2],
	more: Parameters<typeof started>[3] = [],
) => started({}, memory(), given, [...models, ...more])

const outputOf = (name: string, shape: z.ZodType) =>
	defineFunction({
		name,
		output: shape.meta({ id: 'Shape' }),
		run: () => null,
	})

describe('start', () => {
	it('refuses a schema id REST names', async () => {
		const first = defineFunction({
			name: 'first',
			output: z.object({ a: z.string() }).meta({ id: 'Shelf' }),
			run: () => ({ a: 'a' }),
		})
		await expect(refusing([first, shelf])).rejects.toThrow(
			'first: REST names a schema Shelf; give yours another id.',
		)
		const clash = defineFunction({
			name: 'clash',
			output: z.object({ a: z.string() }).meta({ id: 'Book' }),
			run: () => ({ a: 'a' }),
		})
		await expect(refusing([clash])).rejects.toThrow(
			'clash: REST names a schema Book; give yours another id.',
		)
		const late = defineFunction({
			name: 'late',
			query: true,
			output: z.object({ a: z.string() }).meta({ id: 'Late' }),
			run: () => ({ a: 'a' }),
		})
		const Late = defineModel({
			name: 'Late',
			use: [rest()],
			fields: (f) => ({ a: f.string() }),
		})
		await expect(refusing([late], [Late])).rejects.toThrow(
			'late: REST names a schema Late; give yours another id.',
		)
	})

	it('refuses one schema id of two shapes', async () => {
		await expect(
			refusing([outputOf('one', z.string()), outputOf('two', z.number())]),
		).rejects.toThrow(
			'one and two give the schema Shape two shapes; name each once.',
		)
		const same = refusing([
			outputOf('one', z.string()),
			outputOf('two', z.string()),
		])
		await expect(
			same.then(async ({ app }) => app.stop()),
		).resolves.toBeUndefined()
	})

	it('refuses a schema id that is not a schema name', async () => {
		const spaced = defineFunction({
			name: 'spaced',
			output: z.string().meta({ id: 'a b' }),
			run: () => 'a',
		})
		await expect(refusing([spaced])).rejects.toThrow(
			"spaced: a b is not a schema name, which takes letters, digits, '.', '-' and '_'.",
		)
	})

	it('refuses two operations of one id', async () => {
		const books = defineFunction({
			name: 'books',
			query: true,
			run: () => undefined,
		})
		await expect(refusing([books])).rejects.toThrow(
			"books: the operation books is Book's; set .with({ rest: { name } }).",
		)
	})
})
