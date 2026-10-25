// Functions over GraphQL (D-109): their fields and arguments, the types read
// from their JSON Schemas, relations re-read as the caller, and the
// refusals at startup.
import type { GraphQLSchema } from 'graphql'
import { printType } from 'graphql'
import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { Adapter, Transaction } from 'ultimabase'
import { allow, defineFunction, defineType, memory } from 'ultimabase'
import { graphql } from './index.ts'
import type { GraphqlOptions } from './index.ts'
import type { Result } from './test/app.ts'
import { at, M, Post, post, seeded, started, User } from './test/app.ts'

const Address = z
	.object({ city: z.string(), zip: z.string().optional() })
	.meta({ id: 'Address' })

const hello = defineFunction({
	name: 'hello',
	input: z.object({
		name: z.string().min(1),
		times: z.int().default(1),
		at: z.iso.datetime().optional(),
		tags: z.array(z.string()).nullable().optional(),
	}),
	output: z.object({
		text: z.string(),
		at: z.iso.datetime().nullable(),
		seen: z.unknown(),
	}),
	run: ({ input }) => ({
		text: `Hello ${input.name} x${input.times}`,
		at: input.at ?? null,
		seen: input,
	}),
}).with({ access: allow.public })

const stats = defineFunction({
	name: 'stats',
	query: true,
	output: z.object({
		total: z.int(),
		ratio: z.number(),
		open: z.boolean(),
		byStatus: z.array(
			z.object({ status: z.enum(['draft', 'published']), count: z.int() }),
		),
		odd: z.enum(['a-b', 'c']),
		kind: z.literal('stats'),
		extra: z.record(z.string(), z.number()),
		note: z.string().optional(),
	}),
	run: () => ({
		total: 4,
		ratio: 0.5,
		open: true,
		byStatus: [{ status: 'draft' as const, count: 2 }],
		odd: 'a-b' as const,
		kind: 'stats' as const,
		extra: { a: 1 },
	}),
}).with({ access: allow.public })

const double = defineFunction({
	name: 'double',
	query: true,
	use: [graphql()],
	input: z.number(),
	output: z.number(),
	run: ({ input }) => input * 2,
}).with({ access: allow.public, graphql: { name: 'twice' } })

const ship = defineFunction({
	name: 'ship',
	input: z.object({
		to: Address,
		items: z.array(z.object({ sku: z.string() })),
	}),
	output: Address.nullable(),
	run: ({ input }) => (input.items.length > 0 ? input.to : null),
}).with({ access: allow.public })

const ping = defineFunction({ name: 'ping', run: () => undefined }).with({
	access: allow.public,
})

const hidden = defineFunction({
	name: 'hidden',
	query: true,
	use: [graphql()],
	run: () => undefined,
}).with({ access: allow.public, graphql: false })

const latest = defineFunction({
	name: 'latest',
	query: true,
	output: Post.nullable(),
	run: async () => Post.findFirst({ where: { title: 'four' } }, M),
}).with({ access: allow.public })

const recent = defineFunction({
	name: 'recent',
	query: true,
	output: [Post],
	run: async () => Post.findMany({ orderBy: { title: 'asc' } }, M),
}).with({ access: allow.public })

const Board = defineType({
	name: 'Board',
	fields: {
		top: Post,
		posts: [Post],
		best: Post.nullable(),
		ghost: User.nullable(),
		label: z.string(),
	},
})
async function boardOf() {
	const posts = await Post.findMany({ orderBy: { title: 'asc' } }, M)
	const [top] = posts
	if (top === undefined) throw new Error('No post.')
	const epoch = new Date(0)
	return {
		top,
		posts,
		best: null,
		// A row no caller reads: its relations are empty.
		ghost: {
			id: 'gone',
			name: 'ghost',
			email: 'ghost@example.com',
			password: null,
			createdAt: epoch,
			updatedAt: epoch,
		},
		label: 'board',
	}
}
const board = defineFunction({
	name: 'board',
	query: true,
	output: Board,
	run: boardOf,
}).with({ access: allow.public })

const boards = defineFunction({
	name: 'boards',
	query: true,
	output: [Board],
	run: async () => [await boardOf(), await boardOf()],
}).with({ access: allow.public })

const locate = defineFunction({
	name: 'locate',
	query: true,
	input: Address,
	output: Address,
	run: ({ input }) => input,
}).with({ access: allow.public })

const nameless = defineFunction({
	name: 'nameless',
	query: true,
	output: Post,
	run: async () => {
		const row = await Post.findFirst({}, M)
		if (row === null) throw new Error('No post.')
		// A plain JavaScript run can lose the id its types promise.
		const copy = { ...row }
		Reflect.deleteProperty(copy, 'id')
		return copy
	},
}).with({ access: allow.public })

/** A Standard Schema, with or without a JSON Schema export. */
type Schema = {
	readonly '~standard': {
		readonly version: 1
		readonly vendor: string
		readonly validate: (value: unknown) => { readonly value: unknown }
	}
}

/** A Standard Schema whose JSON Schema export is `json`'s. */
function exporting(json: () => unknown): Schema {
	const standard = {
		version: 1 as const,
		vendor: 'test',
		validate: (value: unknown) => ({ value }),
		jsonSchema: { input: json, output: json },
	}
	return { '~standard': standard }
}

const loose = exporting(() => ({
	type: 'object',
	properties: {
		any: true,
		list: { type: 'array' },
		empty: { type: 'object', properties: {} },
	},
}))
const lax = defineFunction({
	name: 'lax',
	input: loose,
	output: loose,
	run: ({ input }) => input,
}).with({ access: allow.public })

const closed = defineFunction({
	name: 'closed',
	query: true,
	output: z.string(),
	run: () => 'never',
})

const functions = [
	hello,
	stats,
	double,
	ship,
	ping,
	hidden,
	latest,
	recent,
	board,
	boards,
	locate,
	nameless,
	lax,
	closed,
]

let stop: (() => Promise<void>) | undefined
afterEach(async () => {
	await stop?.()
	stop = undefined
})

/** `memory()`, the model of each row read pushed to `reads`. */
function counting(reads: string[]): Adapter {
	const base = memory()
	const tracked = (on: Transaction): Transaction => ({
		find: async (read) => {
			reads.push(read.model)
			return on.find(read)
		},
		count: async (read) => on.count(read),
		write: async (write) => on.write(write),
		commit: async () => on.commit(),
		rollback: async () => on.rollback(),
	})
	return {
		start: async (schema) => base.start(schema),
		stop: async () => base.stop(),
		find: async (read) => {
			reads.push(read.model)
			return base.find(read)
		},
		count: async (read) => base.count(read),
		write: async (write) => base.write(write),
		begin: async () => tracked(await base.begin()),
	}
}

/** The application with `functions`, and the schema it serves. */
async function serving(
	options: GraphqlOptions = {},
	given: Parameters<typeof started>[3] = functions,
	database: Adapter = memory(),
) {
	let schema: GraphQLSchema | undefined
	const served = await started(
		{
			...options,
			extend: (generated) => {
				schema = generated
				return generated
			},
		},
		database,
		[],
		given,
	)
	stop = async () => served.app.stop()
	const typeOf = (name: string): string => {
		const type = schema?.getType(name)
		return type === undefined ? 'none' : printType(type)
	}
	const send = async (query: string, variables?: object): Promise<Result> =>
		post(`${served.url}/graphql`, query, variables)
	return { ...served, typeOf, send }
}

describe('fields', () => {
	it('puts a query under Query and a mutation under Mutation', async () => {
		const { typeOf } = await serving()
		const query = typeOf('Query')
		expect(query).toContain('  stats: StatsOutput!')
		expect(query).toContain('  twice(input: Float!): Float!')
		expect(query).toContain('  latest: Post\n')
		expect(query).toContain('  recent: [Post!]!')
		expect(query).toContain('  board: Board!')
		expect(query).toContain('  boards: [Board!]!')
		expect(query).toContain('  locate(city: String!, zip: String): Address!')
		expect(query).not.toContain('hidden')
		const mutation = typeOf('Mutation')
		expect(mutation).toContain(
			'  hello(name: String!, times: Int, at: DateTime, tags: [String!]): HelloOutput!',
		)
		expect(mutation).toContain(
			'  ship(to: AddressInput!, items: [ShipInputItems!]!): Address\n',
		)
		expect(mutation).toContain('  ping: Boolean!')
		expect(mutation).toContain(
			'  lax(any: JSON, list: [JSON], empty: JSON): LaxOutput!',
		)
	})

	it('types a JSON Schema', async () => {
		const { typeOf } = await serving()
		expect(typeOf('StatsOutput')).toBe(`type StatsOutput {
  total: Int!
  ratio: Float!
  open: Boolean!
  byStatus: [StatsOutputByStatus!]!
  odd: String!
  kind: String!
  extra: JSON!
  note: String
}`)
		expect(typeOf('StatsOutputByStatusStatus'))
			.toBe(`enum StatsOutputByStatusStatus {
  draft
  published
}`)
		expect(typeOf('HelloOutput')).toBe(`type HelloOutput {
  text: String!
  at: DateTime
  seen: JSON
}`)
		expect(typeOf('Address')).toBe(`type Address {
  city: String!
  zip: String
}`)
		expect(typeOf('AddressInput')).toBe(`input AddressInput {
  city: String!
  zip: String
}`)
		expect(typeOf('LaxOutput')).toBe(`type LaxOutput {
  any: JSON
  list: [JSON]
  empty: JSON
}`)
		expect(typeOf('Board')).toBe(`type Board {
  top: Post!
  posts: [Post!]!
  best: Post
  ghost: User
  label: String!
}`)
	})
})

describe('calls', () => {
	it('validates the arguments the client sent', async () => {
		const { send } = await serving()
		const sent = await send(
			'mutation { hello(name: "ada", at: "2026-01-02T03:04:05Z", tags: null) { text at seen } }',
		)
		expect(sent).toEqual({
			data: {
				hello: {
					text: 'Hello ada x1',
					at: '2026-01-02T03:04:05.000Z',
					seen: {
						name: 'ada',
						times: 1,
						at: '2026-01-02T03:04:05Z',
						tags: null,
					},
				},
			},
		})
		const refused = await send('mutation { hello(name: "") { text } }')
		expect(at(refused, 'errors', 0, 'extensions', 'code')).toBe(
			'VALIDATION_FAILED',
		)
		// The validator reads the date as sent: this one refuses an offset.
		const offset = await send(
			'mutation { hello(name: "ada", at: "2026-01-02T05:04:05+02:00") { text } }',
		)
		expect(at(offset, 'errors', 0, 'extensions', 'code')).toBe(
			'VALIDATION_FAILED',
		)
	})

	it('takes any other input as one argument, and returns true without an output', async () => {
		const { send } = await serving()
		expect(await send('{ twice(input: 2.5) }')).toEqual({
			data: { twice: 5 },
		})
		expect(await send('mutation { ping }')).toEqual({ data: { ping: true } })
		const shipped = await send(
			'mutation($to: AddressInput!) { a: ship(to: $to, items: [{ sku: "x" }]) { city zip } b: ship(to: $to, items: []) { city } }',
			{ to: { city: 'Paris' } },
		)
		expect(shipped).toEqual({
			data: { a: { city: 'Paris', zip: null }, b: null },
		})
	})

	it('returns the values run returned', async () => {
		const { send } = await serving()
		expect(
			await send(
				'{ stats { total ratio open byStatus { status count } odd kind extra note } }',
			),
		).toEqual({
			data: {
				stats: {
					total: 4,
					ratio: 0.5,
					open: true,
					byStatus: [{ status: 'draft', count: 2 }],
					odd: 'a-b',
					kind: 'stats',
					extra: { a: 1 },
					note: null,
				},
			},
		})
	})

	it('types a literal number or boolean as its scalar', async () => {
		const Literal = z.object({
			one: z.literal(1),
			half: z.literal(1.5),
			yes: z.literal(true),
		})
		const literal = defineFunction({
			name: 'literal',
			query: true,
			input: Literal,
			output: Literal,
			run: ({ input }) => input,
		}).with({ access: allow.public })
		const { send, typeOf } = await serving({}, [literal])
		expect(typeOf('LiteralOutput')).toBe(`type LiteralOutput {
  one: Int!
  half: Float!
  yes: Boolean!
}`)
		expect(
			await send('{ literal(one: 1, half: 1.5, yes: true) { one half yes } }'),
		).toEqual({ data: { literal: { one: 1, half: 1.5, yes: true } } })
	})

	it('names .nullable() when run returns undefined', async () => {
		const maybe = defineFunction({
			name: 'maybe',
			query: true,
			output: z.string().optional(),
			run: () => undefined,
		}).with({ access: allow.public })
		const { send, lines } = await serving({}, [maybe])
		const read = await send('{ maybe }')
		expect(at(read, 'errors', 0, 'message')).toBe('Internal error.')
		const logged = lines.find((line) => line.level === 'error')
		expect(at(logged?.first, 'err', 'message')).toBe(
			'maybe returned undefined; make its output .nullable() and return null.',
		)
	})

	it('refuses a caller the access rule refuses', async () => {
		const { send } = await serving()
		const refused = await send('{ closed }')
		expect(at(refused, 'errors', 0, 'message')).toBe('closed refused.')
	})
})

describe('relations', () => {
	it('re-reads the relations selected, as the caller', async () => {
		const { send } = await serving()
		await seeded()
		const read = await send(
			'{ latest { title author { name email } } recent { title author { name } } }',
		)
		expect(read.errors).toBeUndefined()
		expect(at(read, 'data', 'latest')).toEqual({
			title: 'four',
			// The caller does not read emails.
			author: { name: 'bob', email: null },
		})
		expect(at(read, 'data', 'recent')).toEqual([
			{ title: 'four', author: { name: 'bob' } },
			{ title: 'one', author: { name: 'ada' } },
			{ title: 'three', author: { name: 'ada' } },
			{ title: 'two', author: { name: 'ada' } },
		])
	})

	it('reads the rows of one model in one query, and none without a relation', async () => {
		const reads: string[] = []
		const { send } = await serving({}, functions, counting(reads))
		await seeded()
		reads.length = 0
		const read = await send(
			'{ board { label best { title } top { title author { name } } posts { title author { name } } ghost { name posts { edges { node { title } } } } } }',
		)
		expect(read.errors).toBeUndefined()
		expect(at(read, 'data', 'board', 'top')).toEqual({
			title: 'four',
			author: { name: 'bob' },
		})
		expect(at(read, 'data', 'board', 'posts', 1)).toEqual({
			title: 'one',
			author: { name: 'ada' },
		})
		expect(at(read, 'data', 'board', 'best')).toBeNull()
		// A row the caller cannot read: no relation.
		expect(at(read, 'data', 'board', 'ghost')).toEqual({
			name: 'ghost',
			posts: { edges: [] },
		})
		// run's read, then one for the posts' authors and one for the ghost's posts.
		expect(reads).toEqual(['Post', 'Post', 'User'])
		reads.length = 0
		await send('{ latest { title } recent { title } }')
		expect(reads).toEqual(['Post', 'Post'])
	})

	it('copies the fields a type selects, and re-reads nothing', async () => {
		const reads: string[] = []
		const { send } = await serving({}, functions, counting(reads))
		await seeded()
		reads.length = 0
		expect(await send('{ boards { label } }')).toEqual({
			data: { boards: [{ label: 'board' }, { label: 'board' }] },
		})
		expect(reads).toEqual(['Post', 'Post'])
	})

	it('refuses a row returned without its id', async () => {
		const { send, lines } = await serving()
		await seeded()
		const read = await send('{ nameless { title author { name } } }')
		expect(at(read, 'errors', 0, 'message')).toBe('Internal error.')
		const logged = lines.find((line) => line.level === 'error')
		expect(at(logged?.first, 'err', 'message')).toBe(
			'A Post was returned without its id.',
		)
	})

	it('refuses a relation selected in two ways', async () => {
		const { send } = await serving()
		await seeded()
		const read = await send(
			'{ board { top { author { name } } posts { author { email } } } }',
		)
		expect(at(read, 'errors', 0, 'message')).toBe(
			'Post.author is selected in two ways; select it the same way everywhere.',
		)
	})
})

describe('limits', () => {
	it('counts take rows for a list', async () => {
		const { send } = await serving({ take: 5, maxRows: 4 })
		const refused = await send('{ recent { title } }')
		expect(at(refused, 'errors', 0, 'message')).toBe(
			'The document asks for more than 4 rows. Ask for fewer with first or last.',
		)
		const nested = await send('{ board { posts { title } } }')
		expect(at(nested, 'errors', 0, 'message')).toContain('more than 4 rows')
		expect(await send('{ latest { title } }')).toEqual({
			data: { latest: null },
		})
	})

	it('refuses a list longer than take under a selected relation', async () => {
		const { send, lines } = await serving({ take: 1 })
		await seeded()
		const titles = await send('{ recent { title } }')
		expect(at(titles, 'data', 'recent')).toHaveLength(4)
		const read = await send('{ recent { title author { name } } }')
		expect(at(read, 'errors', 0, 'message')).toBe('Internal error.')
		const logged = lines.find((line) => line.level === 'error')
		expect(at(logged?.first, 'err', 'message')).toBe(
			'recent returned 4 rows; a list counts take (1) rows, so it holds no more under a selected relation.',
		)
	})
})

const returning = (name: string, output: Schema | z.ZodType) =>
	defineFunction({ name, query: true, output, run: () => null }).with({
		access: allow.public,
	})

/** A schema of one object type, `Same`, with one field. */
const same = (key: string) =>
	exporting(() => ({
		$ref: '#/$defs/Same',
		$defs: {
			Same: { type: 'object', properties: { [key]: { type: 'string' } } },
		},
	}))

describe('startup', () => {
	it.each([
		['union', z.union([z.string(), z.int()])],
		['types', exporting(() => ({ type: ['string', 'integer'] }))],
		[
			'variants',
			exporting(() => ({
				oneOf: [{ type: 'string' }, { type: 'integer' }, { type: 'null' }],
			})),
		],
	])('refuses a union: %s', async (name, output) => {
		await expect(serving({}, [returning(name, output)])).rejects.toThrow(
			`${name}: output is a union, which GraphQL cannot type; keep one type, or one and null.`,
		)
	})

	it('refuses a schema without its JSON Schema', async () => {
		const bare: Schema = {
			'~standard': {
				version: 1,
				vendor: 'test',
				validate: (value) => ({ value }),
			},
		}
		await expect(serving({}, [returning('bare', bare)])).rejects.toThrow(
			'bare: output has no standard JSON Schema export.',
		)
		const failing = exporting(() => {
			throw new Error('Dates cannot be represented')
		})
		await expect(serving({}, [returning('failing', failing)])).rejects.toThrow(
			'failing: output: Dates cannot be represented.',
		)
		await expect(
			serving({}, [
				returning(
					'odd',
					exporting(() => 5),
				),
			]),
		).rejects.toThrow("odd: output's JSON Schema is not an object.")
	})

	it('refuses a type named twice, or like a model', async () => {
		await expect(
			serving({}, [returning('one', same('a')), returning('two', same('b'))]),
		).rejects.toThrow(
			'one and two give the type Same two shapes; name each once.',
		)
		await expect(
			serving({}, [
				returning('model', z.object({ a: z.string() }).meta({ id: 'Post' })),
			]),
		).rejects.toThrow('model: the type Post is named like a model.')
		const connection = z
			.object({ a: z.string() })
			.meta({ id: 'UserConnection' })
		await expect(serving({}, [returning('edges', connection)])).rejects.toThrow(
			"edges: the type UserConnection is a generated type's name.",
		)
		const PageInfo = defineType({ name: 'PageInfo', fields: { a: z.string() } })
		const pi = defineFunction({
			name: 'pi',
			query: true,
			output: PageInfo,
			run: () => ({ a: 'x' }),
		}).with({ access: allow.public })
		await expect(serving({}, [pi])).rejects.toThrow(
			"pi: the type PageInfo is a generated type's name.",
		)
	})

	it('refuses a name GraphQL refuses', async () => {
		const named = defineFunction({
			name: 'named',
			use: [graphql()],
			run: () => undefined,
		}).with({ access: allow.public, graphql: { name: 'bad-name' } })
		await expect(serving({}, [named])).rejects.toThrow(
			'named: bad-name is not a GraphQL name.',
		)
		await expect(
			serving({}, [returning('key', z.object({ 'a-b': z.string() }))]),
		).rejects.toThrow('key: output.a-b: a-b is not a GraphQL name.')
		const nested = z.object({
			to: z.object({ c: z.string() }).meta({ id: 'a-b' }),
		})
		await expect(serving({}, [returning('ref', nested)])).rejects.toThrow(
			'ref: output.to refers to a-b, which is not a GraphQL name; name it with .meta({ id }).',
		)
		await expect(
			serving({}, [
				returning(
					'far',
					exporting(() => ({ $ref: '#/definitions/X' })),
				),
			]),
		).rejects.toThrow('far: output refers to #/definitions/X, not a $defs.')
		const tree = exporting(() => ({
			type: 'object',
			properties: { children: { type: 'array', items: { $ref: '#' } } },
		}))
		await expect(serving({}, [returning('tree', tree)])).rejects.toThrow(
			'tree: output.children[] refers to its own schema; name it with .meta({ id }).',
		)
		const Bad = defineType({ name: 'Bad', fields: { 'a-b': z.string() } })
		const typed = defineFunction({
			name: 'typed',
			query: true,
			output: Bad,
			run: () => ({ 'a-b': 'x' }),
		}).with({ access: allow.public })
		await expect(serving({}, [typed])).rejects.toThrow(
			'Bad.a-b: a-b is not a GraphQL name.',
		)
	})

	it("refuses a root field a model's field holds", async () => {
		const posts = defineFunction({
			name: 'posts',
			query: true,
			run: () => undefined,
		}).with({ access: allow.public })
		await expect(serving({}, [posts])).rejects.toThrow(
			"posts: the root field posts is Post's; set .with({ graphql: { name } }).",
		)
	})
})
