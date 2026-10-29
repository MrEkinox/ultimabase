// Functions at run time (D-27, D-75, D-109): the access rule before the
// input's validation, `run`'s facts, outputs read at definition, and the
// application's functions checked at `start`.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { asUser } from '@ultimabase/testing'
import type { ExposedFunction, Logger, PluginTypes } from './index.ts'
import {
	allow,
	defineApp,
	defineFunction,
	defineModel,
	definePlugin,
	defineType,
	master,
	memory,
} from './index.ts'

const manifest = {
	name: 'test-plugin',
	version: '1.0.0',
	peerDependencies: { ultimabase: '*' },
}
interface Rpc extends PluginTypes {
	readonly name: 'rpc'
	readonly functionWith: { readonly name?: string }
}
let exposed: readonly ExposedFunction<Rpc['functionWith']>[] = []
const nothing = (): undefined => undefined

const rpc = definePlugin<Rpc>({
	name: 'rpc',
	manifest,
	start: ({ functions }) => {
		exposed = functions
	},
})

const Post = defineModel({
	name: 'Post',
	fields: (f) => ({ title: f.string() }),
}).with({ access: allow.public })

const logged: { level: string; first: unknown; message: unknown }[] = []
const logger: Logger = {
	info: () => undefined,
	warn: (first: unknown, message?: string) => {
		logged.push({ level: 'warn', first, message })
	},
	error: () => undefined,
	child: () => logger,
}

const seen: unknown[] = []
const closed = defineFunction({ name: 'closed', run: () => undefined })
const greet = defineFunction({
	name: 'greet',
	use: [rpc.use()],
	input: z.object({ name: z.string().trim().min(1) }),
	output: z.string(),
	run: (facts) => {
		seen.push(facts)
		return `Hello ${facts.input.name}`
	},
}).with({ access: allow.public, rpc: { name: 'hello' } })
const latest = defineFunction({
	name: 'latest',
	query: true,
	output: Post.nullable(),
	run: async ({ caller }) => Post.findFirst({}, { as: caller }),
}).with({ access: ({ caller }) => caller.kind === 'user' })
const Hit = defineType({
	name: 'Hit',
	fields: { post: Post.nullable(), score: z.number() },
})
const Page = defineType({
	name: 'Page',
	fields: { hits: [Hit], best: Hit.nullable(), first: Hit },
})
const search = defineFunction({
	name: 'search',
	output: Page,
	run: async ({ caller }) => ({
		hits: [],
		best: null,
		first: { post: await Post.findFirst({}, { as: caller }), score: 1 },
	}),
})

let created: unknown

const app = defineApp({
	database: memory(),
	logger,
	plugins: [rpc.plugin()],
	models: [Post],
	functions: [closed, greet, latest, search],
})

beforeEach(async () => {
	logged.length = 0
	seen.length = 0
	await app.start()
	created = await Post.create({ data: { title: 'a' } }, { as: master })
})
afterEach(async () => {
	await app.stop()
})

// Asymmetric matchers are typed `any`.
const aMessage: unknown = expect.any(String)
const containing = (fields: object): unknown => expect.objectContaining(fields)

/** Runs `task` in an application of `functions` alone, then restarts `app`. */
const alone = async (
	functions: readonly unknown[],
	task: () => Promise<void> = async () => undefined,
): Promise<void> => {
	const other = defineApp({
		database: memory(),
		models: [Post],
		// @ts-expect-error: the test passes what the types refuse.
		functions,
	})
	await app.stop()
	try {
		await other.start()
		try {
			await task()
		} finally {
			await other.stop()
		}
	} finally {
		await app.start()
	}
}

const bad = (output: unknown) => () =>
	// @ts-expect-error: an output is a model, a type or a schema.
	defineFunction({ name: 'bad', output, run: () => undefined })
const refused = (definition: unknown) => () =>
	// @ts-expect-error: the test passes what the types refuse.
	defineFunction(definition)
const one = () => 1

describe('run (D-75)', () => {
	it('is closed to all but Master by default (D-04)', async () => {
		await expect(closed.run()).rejects.toMatchObject({
			code: 'ACCESS_DENIED',
			message: 'closed refused.',
			details: { function: 'closed' },
		})
		await expect(closed.run({ as: asUser({ id: 'ada' }) })).rejects.toThrow(
			'closed refused.',
		)
		expect(logged).toEqual([
			{
				level: 'warn',
				first: containing({ callerId: null, function: 'closed' }),
				message: aMessage,
			},
			{
				level: 'warn',
				first: containing({ callerId: 'ada' }),
				message: aMessage,
			},
		])
	})

	it('returns nothing without an output', async () => {
		await expect(closed.run({ as: master })).resolves.toBeUndefined()
		const stray = defineFunction({
			name: 'stray',
			// @ts-expect-error: without an output, `run` returns nothing.
			run: () => 1,
		})
		await alone([stray], async () => {
			await expect(stray.run({ as: master })).resolves.toBeUndefined()
		})
	})

	it('validates the input after the rule, and runs on its output', async () => {
		await expect(greet.run({ name: ' Ada ' })).resolves.toBe('Hello Ada')
		expect(seen).toEqual([
			{ caller: { kind: 'anonymous' }, input: { name: 'Ada' } },
		])
		expect(Object.isFrozen(seen[0])).toBe(true)
		const failed = greet.run({ name: ' ' })
		await expect(failed).rejects.toMatchObject({
			code: 'VALIDATION_FAILED',
			details: { issues: [expect.objectContaining({ path: ['name'] })] },
		})
	})

	it('validates even Master’s input', async () => {
		// @ts-expect-error: the input is checked by its schema's type.
		const failed = greet.run({ name: 1 }, { as: master })
		await expect(failed).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
	})

	it('checks the rule before the input', async () => {
		const sent = latest.run({ as: { kind: 'anonymous' } })
		await expect(sent).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
		const read = latest.run({ as: asUser({ id: 'ada' }) })
		await expect(read).resolves.toMatchObject({ title: 'a' })
	})

	it('reads the caller as a query does', async () => {
		// @ts-expect-error: Master is the kernel's.
		const forged = closed.run({ as: { kind: 'master' } })
		await expect(forged).rejects.toThrow(
			'options.as is a Master the kernel did not create.',
		)
		// @ts-expect-error: options take only `as`.
		await expect(closed.run({ to: master })).rejects.toThrow('options.to')
	})

	it('refuses a rule that is not a function or returns no boolean', async () => {
		const notRule = defineFunction({ name: 'notRule', run: () => undefined })
		// @ts-expect-error: access is a rule.
		notRule.with({ access: true })
		const notBoolean = defineFunction({
			name: 'notBoolean',
			run: () => undefined,
		})
		// @ts-expect-error: a rule returns a boolean.
		notBoolean.with({ access: () => 'yes' })
		await alone([notRule, notBoolean], async () => {
			await expect(notRule.run()).rejects.toThrow(
				'notRule: access is a function.',
			)
			await expect(notBoolean.run()).rejects.toThrow(
				'notBoolean: access returns a boolean.',
			)
		})
	})

	it('runs only in a started application that lists it', async () => {
		const other = defineFunction({ name: 'other', run: () => undefined })
		await expect(other.run({ as: master })).rejects.toThrow(
			'other is not a function of a started application.',
		)
		await app.stop()
		await expect(closed.run({ as: master })).rejects.toThrow(
			'closed is not a function of a started application.',
		)
		await app.start()
	})
})

describe('outputs (D-109)', () => {
	it('returns a named type with its models', async () => {
		await expect(search.run({ as: master })).resolves.toEqual({
			hits: [],
			best: null,
			first: { post: created, score: 1 },
		})
	})

	it('reads each output once, at its definition', () => {
		const message =
			'bad.output is a model, a type, a list of one, X.nullable() or a Standard Schema.'
		expect(bad({})).toThrow(message)
		expect(bad([Post, Post])).toThrow(message)
		expect(bad([])).toThrow(message)
		expect(bad('Post')).toThrow(message)
		expect(bad([Post.nullable()])).toThrow(message)
	})

	it('refuses a type without a name or fields', () => {
		expect(() => defineType({ name: '', fields: { a: Post } })).toThrow(
			'defineType takes a name.',
		)
		expect(() => defineType({ name: 'Empty', fields: {} })).toThrow(
			'Empty: fields is an object of one output or more.',
		)
		// @ts-expect-error: fields is an object.
		expect(() => defineType({ name: 'List', fields: [] })).toThrow(
			'List: fields is an object of one output or more.',
		)
		// @ts-expect-error: a field is an output.
		expect(() => defineType({ name: 'Odd', fields: { a: 1 } })).toThrow(
			'Odd.a is a model, a type, a list of one, X.nullable() or a Standard Schema.',
		)
	})
})

describe('plugins (D-109)', () => {
	it('read the functions, in their order, with their key', () => {
		expect(exposed.map(({ name, query, used }) => [name, query, used])).toEqual(
			[
				['closed', false, false],
				['greet', false, true],
				['latest', true, false],
				['search', false, false],
			],
		)
		const [none, hello, nullable, page] = exposed
		expect(hello?.with).toEqual({ name: 'hello' })
		expect(none?.with).toBeUndefined()
		expect(hello?.input).toBe(greet.input)
		expect(none?.input).toBeUndefined()
		expect(none?.output).toBeUndefined()
		expect(hello?.output).toEqual({ kind: 'schema', schema: greet.output })
		expect(nullable?.output).toMatchObject({
			kind: 'model',
			name: 'Post',
			form: 'nullable',
		})
		expect(page?.output).toMatchObject({ kind: 'type', form: 'one' })
		const type = page?.output?.kind === 'type' ? page.output.type : undefined
		expect(type?.name).toBe('Page')
		expect([...(type?.fields ?? new Map()).entries()]).toEqual([
			['hits', expect.objectContaining({ kind: 'type', form: 'list' })],
			['best', expect.objectContaining({ kind: 'type', form: 'nullable' })],
			['first', expect.objectContaining({ kind: 'type', form: 'one' })],
		])
		expect(Object.isFrozen(hello)).toBe(true)
	})

	it('run a function as server code does', async () => {
		const [none, hello] = exposed
		await expect(hello?.run({ name: ' Ada ' }, {})).resolves.toBe('Hello Ada')
		await expect(none?.run(undefined, {})).rejects.toMatchObject({
			code: 'ACCESS_DENIED',
		})
		await expect(none?.run(undefined, { as: master })).resolves.toBeUndefined()
		const invalid = hello?.run({ name: 1 }, { as: master })
		await expect(invalid).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
	})
})

describe('defineFunction', () => {
	it('requires a query with a plugin that takes queries only (D-154)', () => {
		interface Live extends PluginTypes {
			readonly name: 'live'
			readonly functionWith: object
			readonly queryOnly: true
		}
		const live = definePlugin<Live>({ name: 'live', manifest })
		const use = [live.use(), rpc.use()] as const
		const query = defineFunction({ name: 'q', query: true, use, run: nothing })
		expect(query.name).toBe('q')
		// @ts-expect-error: a mutation cannot list a plugin of queries only.
		const mutation = defineFunction({
			name: 'm',
			use: [live.use()],
			run: nothing,
		})
		expect(mutation.name).toBe('m')
		// @ts-expect-error: nor can a function that says `query: false`.
		defineFunction({ name: 'f', query: false, use: [live.use()], run: nothing })
	})

	it('refuses what is not a definition', () => {
		expect(refused({ name: '', run: one })).toThrow(
			'defineFunction takes a name.',
		)
		expect(refused({ name: 'f', query: 1, run: one })).toThrow(
			'f: query is a boolean.',
		)
		expect(refused({ name: 'f', input: {}, run: one })).toThrow(
			'f: input is a Standard Schema.',
		)
		expect(refused({ name: 'f' })).toThrow('f: run is a function.')
		expect(refused({ name: 'f', use: rpc.use(), run: one })).toThrow(
			'f.use is a list.',
		)
		expect(refused({ name: 'f', use: [1], run: one })).toThrow(
			"f.use lists a value no plugin's entry returned.",
		)
		expect(
			refused({ name: 'f', use: [rpc.use(), rpc.use()], run: one }),
		).toThrow('f.use lists rpc twice.')
	})

	it('takes its rules in one `.with`', () => {
		const once = defineFunction({ name: 'once', run: () => undefined })
		expect(once.with({ access: allow.public })).toBe(once)
		expect(() => once.with({})).toThrow('once takes its rules in one `.with`.')
		const twice = defineFunction({ name: 'twice', run: () => undefined })
		expect(() => twice.with(1)).toThrow('twice.with takes an object.')
	})
})

describe('start (D-109)', () => {
	it('refuses a value defineFunction did not return', async () => {
		await expect(alone([{}])).rejects.toThrow(
			'functions lists a value that defineFunction did not return.',
		)
		await expect(alone(['f'])).rejects.toThrow(
			'functions lists a value that defineFunction did not return.',
		)
	})

	it('refuses two functions of one name', async () => {
		const again = defineFunction({ name: 'closed', run: () => undefined })
		await expect(alone([closed, again])).rejects.toThrow(
			'functions lists two functions named closed.',
		)
	})

	it('refuses a plugin that is not installed', async () => {
		await expect(alone([greet])).rejects.toThrow(
			'greet uses rpc, which is not in plugins.',
		)
	})

	it('refuses a model that is not in models', async () => {
		const Other = defineModel({
			name: 'Other',
			fields: (f) => ({ a: f.string() }),
		})
		const other = defineFunction({
			name: 'other',
			output: defineType({ name: 'Box', fields: { other: [Other] } }),
			run: () => ({ other: [] }),
		})
		await expect(alone([other])).rejects.toThrow(
			'other returns Other, which is not in models.',
		)
	})

	it('names each type once, apart from the models', async () => {
		const twin = defineFunction({
			name: 'twin',
			output: defineType({ name: 'Hit', fields: { a: z.number() } }),
			run: () => ({ a: 1 }),
		})
		await expect(alone([search, twin])).rejects.toThrow(
			'Two types are named Hit; name each once.',
		)
		const named = defineFunction({
			name: 'named',
			output: defineType({
				name: 'Post',
				fields: { a: z.number() },
			}).nullable(),
			run: () => null,
		})
		await expect(alone([named])).rejects.toThrow(
			'The type Post is named like a model.',
		)
	})
})

describe('nullable', () => {
	it('is a model method no plugin command may take (D-89)', () => {
		interface Odd extends PluginTypes {
			readonly name: 'odd'
			readonly commands: { readonly nullable: () => number }
		}
		const odd = definePlugin<Odd>({
			name: 'odd',
			manifest,
			commands: () => ({ nullable: () => 1 }),
		})
		const box = () =>
			defineModel({
				name: 'Box',
				use: [odd.use()],
				fields: (f) => ({ a: f.string() }),
			})
		expect(box).toThrow(
			'Box.nullable: odd adds a command named after a model method.',
		)
	})
})
