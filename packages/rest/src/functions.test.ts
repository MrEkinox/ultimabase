// Functions over REST (D-129): a query at GET, its input keys as query
// parameters, a mutation at POST, its body as its input, each answered with
// GraphQL's output, and the refusals at start.
import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { Logger, PluginTypes } from 'ultimabase'
import {
	allow,
	defineApp,
	defineFunction,
	definePlugin,
	defineType,
	memory,
} from 'ultimabase'
import { httpPlugin } from '@ultimabase/http'
import { rest, restPlugin } from './index.ts'
import { at, call, M, Post, qs, seeded, started } from './test/app.ts'

const Address = z
	.object({ city: z.string(), zip: z.string().optional() })
	.meta({ id: 'Address' })

const hello = defineFunction({
	name: 'hello',
	input: z.object({ name: z.string().min(1), times: z.int().default(1) }),
	output: z.object({ text: z.string(), seen: z.unknown() }),
	run: ({ input }) => ({
		text: `Hello ${input.name} x${input.times}`,
		seen: input,
	}),
}).with({ access: allow.public })

const Code = z.string().meta({ id: 'Code' })
const search = defineFunction({
	name: 'search',
	query: true,
	input: z.object({
		q: z.string(),
		maybe: z.string().nullable().optional(),
		either: z.union([z.string(), z.literal('x')]).optional(),
		kind: z.literal('post').optional(),
		status: z.enum(['draft', 'published']).optional(),
		code: Code.optional(),
		at: z.iso.datetime().optional(),
		limit: z.int().optional(),
		mixed: z.union([z.string(), z.number()]).optional(),
		tags: z.array(z.string()).optional(),
	}),
	output: z.unknown(),
	run: ({ input }) => input,
}).with({ access: allow.public })

const double = defineFunction({
	name: 'double',
	query: true,
	use: [rest()],
	input: z.number(),
	output: z.number(),
	run: ({ input }) => input * 2,
}).with({ access: allow.public, rest: { name: 'twice' } })

const shout = defineFunction({
	name: 'shout',
	query: true,
	input: z.string(),
	output: z.string(),
	run: ({ input }) => input.toUpperCase(),
}).with({ access: allow.public })

const locate = defineFunction({
	name: 'locate',
	query: true,
	input: Address,
	output: Address,
	run: ({ input }) => input,
}).with({ access: allow.public })

const ship = defineFunction({
	name: 'ship',
	input: z.array(z.string()),
	output: z.int(),
	run: ({ input }) => input.length,
}).with({ access: allow.public })

const ping = defineFunction({ name: 'ping', run: () => undefined }).with({
	access: allow.public,
})

const now = defineFunction({
	name: 'now',
	query: true,
	run: () => undefined,
}).with({ access: allow.public })

const hidden = defineFunction({
	name: 'hidden',
	query: true,
	use: [rest()],
	run: () => undefined,
}).with({ access: allow.public, rest: false })

const latest = defineFunction({
	name: 'latest',
	query: true,
	input: z.object({ title: z.string() }),
	output: Post.nullable(),
	run: async ({ input }) => Post.findFirst({ where: input }, M),
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
		label: z.string(),
	},
})
const board = defineFunction({
	name: 'board',
	query: true,
	input: z.object({ broken: z.boolean().optional() }),
	output: Board,
	run: async ({ input }) => {
		const posts = await Post.findMany({ orderBy: { title: 'asc' } }, M)
		const [top] = posts
		if (top === undefined) throw new Error('No post.')
		const value = { top, posts, best: null, label: 'b' }
		// A plain JavaScript run can break the types it promises.
		if (input.broken === true) Reflect.set(value, 'top', null)
		return value
	},
}).with({ access: allow.public })

const nameless = defineFunction({
	name: 'nameless',
	query: true,
	output: Post,
	run: async () => {
		const row = await Post.findFirst({}, M)
		if (row === null) throw new Error('No post.')
		const copy = { ...row }
		Reflect.deleteProperty(copy, 'id')
		return copy
	},
}).with({ access: allow.public })

const vanish = defineFunction({
	name: 'vanish',
	query: true,
	output: z.string().optional(),
	run: () => undefined,
}).with({ access: allow.public })

const maybe = defineFunction({
	name: 'maybe',
	query: true,
	output: z.string().nullable().optional(),
	run: () => undefined,
}).with({ access: allow.public })

const closed = defineFunction({
	name: 'closed',
	query: true,
	output: z.string(),
	run: () => 'never',
})

/** A Standard Schema of any value, with or without a JSON Schema export. */
type Schema = {
	readonly '~standard': {
		readonly version: 1
		readonly vendor: string
		readonly validate: (value: unknown) => { readonly value: unknown }
		readonly jsonSchema?: {
			readonly input: () => unknown
			readonly output: () => unknown
		}
		readonly types?: { readonly input: unknown; readonly output: unknown }
	}
}

/** A Standard Schema whose JSON Schema export is `json`'s, if any. */
function exporting(json?: () => unknown): Schema {
	const standard = {
		version: 1 as const,
		vendor: 'test',
		validate: (value: unknown) => ({ value }),
		...(json === undefined
			? {}
			: { jsonSchema: { input: json, output: json } }),
	}
	return { '~standard': standard }
}

// Another library's JSON Schemas, whose strings are not all `type: string`.
const loose = defineFunction({
	name: 'loose',
	query: true,
	input: exporting(() => ({
		type: 'object',
		properties: {
			word: { enum: ['a', 'b'] },
			digit: { enum: [1] },
			none: { enum: [] },
			text: { type: ['string', 'null'] },
			blank: { anyOf: [{ type: 'null' }] },
		},
	})),
	output: exporting(() => ({ anyOf: [{ type: 'object' }, { type: 'null' }] })),
	run: ({ input }) =>
		typeof input === 'object' && input !== null && Object.keys(input).length > 0
			? input
			: undefined,
}).with({ access: allow.public })

const functions = [
	hello,
	search,
	double,
	shout,
	locate,
	ship,
	ping,
	now,
	hidden,
	latest,
	recent,
	board,
	nameless,
	vanish,
	maybe,
	closed,
	loose,
]

let stop: (() => Promise<void>) | undefined
afterEach(async () => {
	await stop?.()
	stop = undefined
})

let logged: Awaited<ReturnType<typeof started>>['lines'] = []

async function serving() {
	const running = await started({}, memory(), functions)
	stop = async () => running.app.stop()
	logged = running.lines
	await seeded()
	return running.url
}

const fn = '/api/functions'

describe('a mutation', () => {
	it('takes its body as its input', async () => {
		const url = await serving()
		const sent = await call(url, 'POST', `${fn}/hello`, {
			body: { name: 'ada' },
		})
		expect(sent).toEqual({
			status: 200,
			body: { text: 'Hello ada x1', seen: { name: 'ada', times: 1 } },
		})
		expect(
			(await call(url, 'POST', `${fn}/ship`, { body: ['a', 'b'] })).body,
		).toBe(2)
	})

	it('refuses an input its schema refuses', async () => {
		const url = await serving()
		const sent = await call(url, 'POST', `${fn}/hello`, { body: { name: '' } })
		expect(sent.status).toBe(400)
		expect(at(sent.body, 'code')).toBe('VALIDATION_FAILED')
	})

	it('returns true without an output, and takes no query parameter', async () => {
		const url = await serving()
		expect(await call(url, 'POST', `${fn}/ping`)).toEqual({
			status: 200,
			body: true,
		})
		const sent = await call(url, 'POST', `${fn}/ping?x=1`)
		expect(at(sent.body, 'message')).toBe(
			"Unknown query parameter 'x'; this route takes none.",
		)
		const body = await call(url, 'POST', `${fn}/hello?x=1`, {
			body: { name: 'ada' },
		})
		expect(body.status).toBe(400)
	})

	it('is not a GET', async () => {
		const url = await serving()
		expect((await call(url, 'GET', `${fn}/hello`)).status).toBe(404)
	})
})

describe('a query', () => {
	it('takes its input keys as parameters, strings as they are', async () => {
		const url = await serving()
		const sent = await call(
			url,
			'GET',
			`${fn}/search${qs({
				q: '42',
				maybe: 'null',
				either: 'x',
				kind: 'post',
				status: 'draft',
				code: 'c-1',
				at: '2026-01-01T00:00:00Z',
				limit: 2,
				mixed: 3,
				tags: ['a'],
			})}`,
		)
		expect(sent).toEqual({
			status: 200,
			body: {
				q: '42',
				maybe: 'null',
				either: 'x',
				kind: 'post',
				status: 'draft',
				code: 'c-1',
				at: '2026-01-01T00:00:00Z',
				limit: 2,
				mixed: 3,
				tags: ['a'],
			},
		})
	})

	it('takes any other input as one parameter, input', async () => {
		const url = await serving()
		expect((await call(url, 'GET', `${fn}/twice?input=3`)).body).toBe(6)
		expect((await call(url, 'GET', `${fn}/shout?input=3`)).body).toBe('3')
		const located = await call(
			url,
			'GET',
			`${fn}/locate${qs({ city: 'Lyon' })}`,
		)
		expect(located.body).toEqual({ city: 'Lyon' })
	})

	it('refuses a parameter its input does not have', async () => {
		const url = await serving()
		const sent = await call(url, 'GET', `${fn}/now?input=1`)
		expect(at(sent.body, 'message')).toBe(
			"Unknown query parameter 'input'; this route takes none.",
		)
		expect((await call(url, 'GET', `${fn}/twice?input=x`)).status).toBe(400)
	})

	it('reads strings from any library’s JSON Schema', async () => {
		const url = await serving()
		const sent = await call(
			url,
			'GET',
			`${fn}/loose${qs({ word: 'a', digit: 1, none: [], text: '1', blank: null })}`,
		)
		expect(sent.body).toEqual({
			word: 'a',
			digit: 1,
			none: [],
			text: '1',
			blank: null,
		})
		expect(await call(url, 'GET', `${fn}/loose`)).toEqual({
			status: 200,
			body: null,
		})
	})

	it('returns true without an output', async () => {
		const url = await serving()
		expect((await call(url, 'GET', `${fn}/now`)).body).toBe(true)
	})

	it('is refused to a caller its access refuses', async () => {
		const url = await serving()
		expect((await call(url, 'GET', `${fn}/closed`)).status).toBe(403)
	})
})

describe('a function’s output', () => {
	it('is a model’s row as GraphQL returns it, or null', async () => {
		const url = await serving()
		const found = await call(url, 'GET', `${fn}/latest${qs({ title: 'four' })}`)
		expect(found.body).toMatchObject({
			title: 'four',
			publishedAt: '2026-01-04T00:00:00.000Z',
		})
		expect(at(found.body, 'author')).toBeUndefined()
		const none = await call(url, 'GET', `${fn}/latest${qs({ title: 'x' })}`)
		expect(none).toEqual({ status: 200, body: null })
	})

	it('is a list of rows', async () => {
		const url = await serving()
		const sent = await call(url, 'GET', `${fn}/recent`)
		expect(
			Array.isArray(sent.body) && sent.body.map((row) => at(row, 'title')),
		).toEqual(['four', 'one', 'three', 'two'])
	})

	it('is a type’s fields, its rows as GraphQL returns them', async () => {
		const url = await serving()
		const sent = await call(url, 'GET', `${fn}/board`)
		expect(sent.status).toBe(200)
		expect(at(sent.body, 'top', 'title')).toBe('four')
		expect(at(sent.body, 'posts', 3, 'title')).toBe('two')
		expect(at(sent.body, 'best')).toBeNull()
		expect(at(sent.body, 'label')).toBe('b')
	})

	it('fails on a value its output refuses', async () => {
		const url = await serving()
		const broken = await call(url, 'GET', `${fn}/board${qs({ broken: true })}`)
		expect(broken.status).toBe(500)
		expect(at(broken.body, 'message')).toBe('Internal error.')
		expect((await call(url, 'GET', `${fn}/nameless`)).status).toBe(500)
		expect((await call(url, 'GET', `${fn}/vanish`)).status).toBe(500)
		const errors = logged
			.filter((line) => line.level === 'error')
			.map((line) => at(line.first, 'err', 'message'))
		expect(errors).toEqual([
			'Cannot return null for non-nullable field Board.top.',
			'A Post was returned without its id.',
			'vanish returned undefined; make its output .nullable() and return null.',
		])
	})

	it('is null for undefined when its output is nullable', async () => {
		const url = await serving()
		expect(await call(url, 'GET', `${fn}/maybe`)).toEqual({
			status: 200,
			body: null,
		})
	})

	it('is none for a hidden function', async () => {
		const url = await serving()
		expect((await call(url, 'GET', `${fn}/hidden`)).status).toBe(404)
	})
})

const refusing = async (given: Parameters<typeof started>[2]) =>
	started({}, memory(), given)

describe('start', () => {
	it('refuses two functions of one route', async () => {
		const other = defineFunction({
			name: 'other',
			use: [rest()],
			run: () => undefined,
		}).with({ rest: { name: 'twice' } })
		await expect(refusing([double, other])).rejects.toThrow(
			"other: the route functions/twice is double's; set .with({ rest: { name } }).",
		)
	})

	it('refuses a name that is not a route name', async () => {
		const odd = defineFunction({
			name: 'odd',
			use: [rest()],
			run: () => undefined,
		}).with({ rest: { name: 'a/b' } })
		await expect(refusing([odd])).rejects.toThrow(
			'odd: a/b is not a route name.',
		)
	})

	it.each([
		[exporting(), 'bare: input has no standard JSON Schema export.'],
		[
			exporting(() => {
				throw new Error('No export')
			}),
			'bare: input: No export.',
		],
		[exporting(() => 3), "bare: input's JSON Schema is not an object."],
	])('refuses an input without a JSON Schema', async (schema, message) => {
		const bare = defineFunction({
			name: 'bare',
			input: schema,
			run: () => undefined,
		})
		await expect(refusing([bare])).rejects.toThrow(message)
	})

	it('refuses an output without a JSON Schema', async () => {
		const bare = defineFunction({
			name: 'bare',
			output: exporting(),
			run: () => 1,
		})
		await expect(refusing([bare])).rejects.toThrow(
			'bare: output has no standard JSON Schema export.',
		)
	})
})

describe('a plugin’s function', () => {
	const signIn = defineFunction({
		name: 'signIn',
		run: ({ client }) => {
			client?.cookies.set('session', 'token', { httpOnly: true })
		},
	}).with({ access: allow.public })
	const signing = definePlugin<PluginTypes & { readonly name: 'signing' }>({
		name: 'signing',
		manifest: {
			name: 'signing',
			version: '1.0.0',
			peerDependencies: { ultimabase: '*' },
		},
		functions: () => [signIn],
	}).plugin()

	/** The URL of an application of the signing plugin and `own`. */
	async function signingApp(
		own: Parameters<typeof defineApp>[0]['functions'] = [],
	) {
		const lines: unknown[] = []
		const logger: Logger = {
			info: (first) => lines.push(first),
			warn: () => undefined,
			error: () => undefined,
			child: () => logger,
		}
		const app = defineApp({
			database: memory(),
			plugins: [httpPlugin({ port: 0 }), restPlugin(), signing],
			models: [],
			functions: own,
			logger,
		})
		await app.start()
		stop = async () => app.stop()
		const listening = lines.find(
			(line) => typeof line === 'string' && line.startsWith('Listening on'),
		)
		return String(listening).replace(/^Listening on (.*)\.$/, '$1')
	}

	it('sets its cookies on the response', async () => {
		const url = await signingApp()
		const response = await fetch(`${url}${fn}/signIn`, { method: 'POST' })
		expect(await response.json()).toBe(true)
		expect(response.headers.getSetCookie()).toEqual([
			'session=token; Path=/; HttpOnly',
		])
	})

	it('is named with its plugin', async () => {
		const own = defineFunction({
			name: 'own',
			use: [rest()],
			run: () => undefined,
		}).with({ rest: { name: 'signIn' } })
		await expect(signingApp([own])).rejects.toThrow(
			"signing.signIn: the route functions/signIn is own's; set .with({ rest: { name } }).",
		)
	})
})
