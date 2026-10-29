// Plugins at run time (D-89): the fields and commands they add, their hooks
// and redirected delete, and the APIs they build once the application starts.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { asUser } from '@ultimabase/testing'
import type { Adapter, Change } from './adapter.ts'
import { modelDefinitions } from './definition.ts'
import type { ExposedModel, Field, PluginTypes } from './index.ts'
import {
	allow,
	defineApp,
	defineModel,
	definePlugin,
	master,
	memory,
} from './index.ts'
import type { Queries } from './query.ts'
import { isObject } from './query-where.ts'

const M = { as: master }
const manifest = {
	name: 'test-plugin',
	version: '1.0.0',
	peerDependencies: { ultimabase: '*' },
}
const log: string[] = []
/** The command each `beforeFind` of `trash` saw, by model. */
const commands: string[] = []
const facts = new Map<string, unknown>()

interface TrashCommands<F> {
	readonly trash: Queries<F>
	readonly run: (task: () => Promise<unknown>) => Promise<unknown>
}
interface Trash extends PluginTypes {
	readonly name: 'trash'
	readonly addedFields: {
		readonly trashedAt: Field<Date, { readonly optional: true }>
	}
	readonly commands: TrashCommands<this['fields']>
}
const trash = definePlugin<Trash>({
	name: 'trash',
	manifest,
	addedFields: (f) => ({ trashedAt: f.dateTime({ optional: true }) }),
	redirect: {
		delete: async ({ where, queries }) => {
			log.push('redirect')
			return queries.update({ where, data: { trashedAt: new Date() } }, M)
		},
	},
	hooks: {
		beforeFind: ({ where, command, ...given }) => {
			commands.push(command ?? 'none')
			facts.set('trash.beforeFind', { command, ...given })
			return command === 'trash'
				? where({ trashedAt: { not: null } })
				: where({ trashedAt: null })
		},
		beforeDelete: () => {
			log.push('trash.beforeDelete')
		},
		afterDelete: ({ record }) => {
			log.push('trash.afterDelete')
			facts.set('trash.afterDelete', record)
		},
		afterDeleteCommit: () => {
			log.push('trash.afterDeleteCommit')
		},
	},
	commands: ({ queries }) => ({
		trash: queries,
		run: async (task) => task(),
	}),
})

interface Named<N extends string> extends PluginTypes {
	readonly name: N
}
const first = definePlugin<Named<'first'>>({
	name: 'first',
	manifest,
	hooks: {
		beforeFind: ({ where }) => {
			log.push('first')
			return where({ AND: [] })
		},
		beforeCreate: () => {
			log.push('first.beforeCreate')
		},
	},
})
const second = definePlugin<Named<'second'>>({
	name: 'second',
	manifest,
	hooks: {
		beforeCreate: () => {
			log.push('second.beforeCreate')
		},
	},
})

const Bin = defineModel({
	name: 'Bin',
	use: [trash.use(), second.use(), first.use()],
	fields: (f) => ({ label: f.string() }),
}).with({
	hooks: {
		beforeCreate: () => {
			log.push('beforeCreate')
		},
		beforeDelete: () => {
			log.push('beforeDelete')
		},
		afterUpdate: async () => {
			log.push('afterUpdate')
			// A hook's queries run outside the command (D-89).
			await Bin.count({}, M)
		},
		afterDelete: () => {
			log.push('afterDelete')
		},
	},
})

const Shelf = defineModel({
	name: 'Shelf',
	use: [trash.use()],
	fields: (f) => ({ label: f.string() }),
}).with({
	access: { read: () => true, write: () => true, delete: () => false },
})

let app: ReturnType<typeof started>
const started = () =>
	defineApp({
		database: memory(),
		plugins: [first.plugin(), trash.plugin(), second.plugin()],
		models: [Bin, Shelf],
	})

const ada = asUser({ id: 'ada' })
// Asymmetric matchers are typed `any`.
const aDate: unknown = expect.any(Date)

const clear = () => {
	log.length = 0
	commands.length = 0
	facts.clear()
}

describe('a plugin on its models', () => {
	beforeEach(async () => {
		app = started()
		await app.start()
		clear()
	})
	afterEach(async () => {
		await app.stop()
	})

	it('adds its fields to each model that uses it', () => {
		const fields = modelDefinitions.get(Bin)?.fields
		expect([...(fields?.keys() ?? [])]).toEqual(['label', 'trashedAt'])
	})

	it('runs its hooks before the application’s, in the order of plugins', async () => {
		await Bin.create({ data: { label: 'a' } }, M)
		expect(log).toEqual([
			'first.beforeCreate',
			'second.beforeCreate',
			'beforeCreate',
		])
	})

	it('ANDs every beforeFind filter', async () => {
		await Bin.create({ data: { label: 'a' } }, M)
		await Bin.trash.create({ data: { label: 'b', trashedAt: new Date() } }, M)
		clear()
		const rows = await Bin.findMany({}, M)
		expect(rows.map((row) => row.label)).toEqual(['a'])
		expect(log).toEqual(['first'])
	})

	it('gives its hooks the model, its options, its APIs and the command', async () => {
		await Bin.trash.findMany({}, M)
		const seen = facts.get('trash.beforeFind')
		expect(seen).toMatchObject({
			name: 'Bin',
			command: 'trash',
			operation: 'read',
			options: {},
		})
		expect(Object.keys(isObject(seen) ? seen : {}).toSorted()).toEqual([
			'caller',
			'command',
			'name',
			'operation',
			'options',
			'plugins',
			'queries',
		])
	})
})

describe('a command', () => {
	beforeEach(async () => {
		app = started()
		await app.start()
		clear()
	})
	afterEach(async () => {
		await app.stop()
	})

	it('is an object of functions or a function, on the model', async () => {
		const kept = await Bin.create({ data: { label: 'a' } }, M)
		const at = new Date()
		await Bin.trash.create({ data: { label: 'b', trashedAt: at } }, M)
		const trashed = await Bin.trash.findMany({}, M)
		expect(trashed.map((row) => row.label)).toEqual(['b'])
		expect(await Bin.run(async () => Bin.count({}, M))).toBe(1)
		expect(await Bin.findUnique({ where: { id: kept.id } }, M)).not.toBeNull()
	})

	it('names itself to its plugin’s hooks on its model only', async () => {
		await Bin.run(async () => Bin.count({}, M))
		await Bin.run(async () => Shelf.count({}, M))
		expect(commands).toEqual(['run', 'none'])
	})

	it('does not reach the queries a hook makes', async () => {
		const row = await Bin.trash.create(
			{ data: { label: 'b', trashedAt: new Date() } },
			M,
		)
		commands.length = 0
		await Bin.trash.update({ where: { id: row.id }, data: { label: 'c' } }, M)
		expect(commands).toEqual(['trash', 'none'])
	})
})

describe('a redirected delete', () => {
	beforeEach(async () => {
		app = started()
		await app.start()
		clear()
	})
	afterEach(async () => {
		await app.stop()
	})

	it('runs the delete path with the redirect in place of the write', async () => {
		const row = await Bin.create({ data: { label: 'a' } }, M)
		clear()
		const deleted = await Bin.delete({ where: { id: row.id } }, M)
		// `first` logs each lookup: the delete's, the redirect's, the hook's.
		expect(log).toEqual([
			'first',
			'trash.beforeDelete',
			'beforeDelete',
			'redirect',
			'first',
			'afterUpdate',
			'first',
			'trash.afterDelete',
			'afterDelete',
			'trash.afterDeleteCommit',
		])
		expect(facts.get('trash.afterDelete')).toEqual(row)
		expect(deleted).toEqual({
			...row,
			trashedAt: aDate,
			updatedAt: aDate,
		})
		expect(await Bin.count({}, M)).toBe(0)
		expect(await Bin.trash.count({}, M)).toBe(1)
		await expect(
			Bin.delete({ where: { id: row.id } }, M),
		).rejects.toMatchObject({ code: 'NOT_FOUND' })
	})

	it('keeps the delete access rule', async () => {
		const row = await Shelf.create({ data: { label: 'a' } }, M)
		clear()
		await expect(
			Shelf.delete({ where: { id: row.id } }, { as: ada }),
		).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
		expect(log).toEqual([])
	})
})

/**
 * A database where setting `purged` removes the row once the update has
 * answered, as a trigger could.
 */
function purging(): Adapter {
	const base = memory()
	return {
		start: async (schema, logger) => base.start(schema, logger),
		stop: async () => base.stop(),
		find: async (read) => base.find(read),
		count: async (read) => base.count(read),
		aggregate: async (read) => base.aggregate(read),
		write: async (write) => base.write(write),
		begin: async () => {
			const tx = await base.begin()
			const purged: Change[] = []
			return {
				...tx,
				find: async (read) => {
					await tx.write({ changes: purged.splice(0) })
					return tx.find(read)
				},
				write: async (write) => {
					const rows = await tx.write(write)
					for (const change of write.changes) {
						if (change.kind === 'update' && change.set['purged'] === true) {
							purged.push({ ...change, kind: 'delete' })
						}
					}
					return rows
				},
			}
		},
	}
}

describe('a redirect that removes the row', () => {
	interface Purge extends PluginTypes {
		readonly name: 'purge'
		readonly addedFields: {
			readonly purged: Field<boolean, { readonly default: false }>
		}
	}
	const purge = definePlugin<Purge>({
		name: 'purge',
		manifest,
		addedFields: (f) => ({ purged: f.boolean({ default: false }) }),
		redirect: {
			delete: async ({ where, queries }) =>
				queries.update({ where, data: { purged: true } }, M),
		},
	})
	const Note = defineModel({
		name: 'Note',
		use: [purge.use()],
		fields: (f) => ({ text: f.string() }),
	})
	const purged = defineApp({
		database: purging(),
		plugins: [purge.plugin()],
		models: [Note],
	})

	it('returns the record as it was', async () => {
		await purged.start()
		try {
			const row = await Note.create({ data: { text: 't' } }, M)
			expect(await Note.delete({ where: { id: row.id } }, M)).toEqual(row)
			expect(await Note.count({}, M)).toBe(0)
		} finally {
			await purged.stop()
		}
	})
})

interface Auth extends PluginTypes {
	readonly name: 'auth'
	readonly appOptions: { readonly who: string }
	readonly api: { readonly who: string }
}
interface Audit extends PluginTypes {
	readonly name: 'audit'
	readonly api: { readonly on: boolean }
}
interface Archive extends PluginTypes {
	readonly name: 'archive'
	readonly requires: Auth
	readonly optional: Audit
	readonly api: { readonly line: string }
	readonly commands: { readonly who: () => string }
}
let failing = false
const lines: string[] = []
const auth = definePlugin<Auth>({
	name: 'auth',
	manifest,
	api: ({ options }) => {
		log.push('auth.api')
		if (failing) throw new Error('auth failed.')
		return { who: options.who }
	},
})
const audit = definePlugin<Audit>({
	name: 'audit',
	manifest,
	api: () => ({ on: true }),
})
const archive = definePlugin<Archive>({
	name: 'archive',
	manifest,
	requires: { auth: auth.plugin },
	optional: { audit: audit.plugin },
	api: ({ plugins }) => {
		log.push('archive.api')
		const line = `${plugins.auth.who} ${String(plugins.audit?.on)}`
		lines.push(line)
		return { line }
	},
	commands: ({ plugins }) => ({ who: () => plugins.auth.who }),
})
const Doc = defineModel({
	name: 'Doc',
	use: [archive.use()],
	fields: (f) => ({ title: f.string() }),
})

describe('plugin APIs', () => {
	beforeEach(() => {
		clear()
		failing = false
		lines.length = 0
	})

	it('are built at start, each after those it needs', async () => {
		const withApis = defineApp({
			database: memory(),
			plugins: [archive.plugin(), audit.plugin(), auth.plugin({ who: 'ada' })],
			models: [Doc],
		})
		expect(() => Doc.who()).toThrow(
			'archive: plugins.auth is read once the application starts.',
		)
		await withApis.start()
		try {
			expect(log).toEqual(['auth.api', 'archive.api'])
			expect(lines).toEqual(['ada true'])
			expect(Doc.who()).toBe('ada')
		} finally {
			await withApis.stop()
		}
	})

	it('read an optional plugin that is not installed as undefined', async () => {
		const plain = defineApp({
			database: memory(),
			plugins: [auth.plugin({ who: 'ada' }), archive.plugin()],
			models: [Doc],
		})
		await plain.start()
		await plain.stop()
		expect(lines).toEqual(['ada undefined'])
	})

	it('stop startup when one fails', async () => {
		failing = true
		const broken = defineApp({
			database: memory(),
			plugins: [auth.plugin({ who: 'ada' }), archive.plugin()],
			models: [Doc],
		})
		await expect(broken.start()).rejects.toThrow('auth failed.')
		await expect(Doc.count({}, M)).rejects.toThrow(
			'Doc is not a model of a started application.',
		)
		failing = false
		await broken.start()
		expect(Doc.who()).toBe('ada')
		await broken.stop()
	})
})

/** Calls `definePlugin` with a definition its types would refuse. */
const loose = (definition: object): { use: unknown; plugin: unknown } => {
	const made: unknown = Reflect.apply(definePlugin, undefined, [
		{ manifest, ...definition },
	])
	if (!isObject(made)) throw new Error('definePlugin returns an object.')
	return { use: made['use'], plugin: made['plugin'] }
}
const called = (fn: unknown, options?: object): unknown => {
	if (typeof fn !== 'function') throw new TypeError('Not a function.')
	const value: unknown = Reflect.apply(fn, undefined, [options])
	return value
}
/** Defines a model using `use`, with a `title` field. */
const using = (...use: readonly unknown[]): unknown => {
	const model: unknown = Reflect.apply(defineModel, undefined, [
		{
			name: 'Page',
			use,
			fields: (f: { string: () => object }) => ({ title: f.string() }),
		},
	])
	return model
}
/** Starts an application its types would refuse. */
const startLoose = async (
	plugins: readonly unknown[],
	models: readonly unknown[] = [],
): Promise<void> => {
	const made: unknown = Reflect.apply(defineApp, undefined, [
		{ database: memory(), plugins, models },
	])
	const start = isObject(made) ? made['start'] : undefined
	const stop = isObject(made) ? made['stop'] : undefined
	await called(start)
	await called(stop)
}

const defined = (definition: unknown) => (): void => {
	Reflect.apply(definePlugin, undefined, [definition])
}
type Builders = { readonly dateTime: () => object }
/** The `addedFields` part that returns `built`, or what it builds. */
const fieldsPart =
	(built: unknown) =>
	(f: Builders): unknown => {
		const fields: unknown =
			typeof built === 'function' ? Reflect.apply(built, undefined, [f]) : built
		return fields
	}
const fieldsOf = (model: unknown) => [
	...((isObject(model) && modelDefinitions.get(model)?.fields.keys()) || []),
]
const addingFields = (name: string, built: unknown) =>
	called(loose({ name, addedFields: fieldsPart(built) }).use)
const addingCommands = (name: string, built: unknown) =>
	called(loose({ name, commands: () => built }).use)
const redirecting = (name: string) =>
	called(loose({ name, redirect: { delete: async () => null } }).use)
const needs = (name: string, other: string) =>
	called(loose({ name, requires: { [other]: () => null } }).plugin)
const titleField = (f: Builders) => ({ title: f.dateTime() })
const atField = (f: Builders) => ({ at: f.dateTime() })
const idField = (f: Builders) => ({ id: f.dateTime() })

describe('definePlugin', () => {
	it('refuses what is not a plugin', () => {
		expect(defined(null)).toThrow(
			new TypeError('definePlugin takes an object.'),
		)
		expect(defined({ manifest })).toThrow('definePlugin takes a name.')
		expect(() => loose({ name: 'p', hooks: 1 })).toThrow(
			new TypeError('p.hooks is an object.'),
		)
		expect(() => loose({ name: 'p', hooks: { afterCreate: 1 } })).toThrow(
			new TypeError('p.hooks.afterCreate is a function.'),
		)
		expect(() => loose({ name: 'p', requires: 'auth' })).toThrow(
			new TypeError('p.requires is an object.'),
		)
		expect(() => loose({ name: 'p', redirect: { delete: true } })).toThrow(
			new TypeError('p.redirect.delete is a function.'),
		)
		expect(() => loose({ name: 'p', commands: {} })).toThrow(
			new TypeError('p.commands is a function.'),
		)
	})
})

describe('a model’s use', () => {
	it('lets the entry’s options decide the fields', () => {
		const stamp = loose({
			name: 'stamp',
			addedFields: (f: Builders, options: object) =>
				'at' in options && typeof options.at === 'string'
					? { [options.at]: f.dateTime() }
					: {},
		})
		expect(fieldsOf(using(called(stamp.use, { at: 'seenAt' })))).toEqual([
			'title',
			'seenAt',
		])
		expect(fieldsOf(using(called(stamp.use)))).toEqual(['title'])
	})

	it('refuses an entry no plugin returned, or one listed twice', () => {
		const once = loose({ name: 'once' })
		expect(() => using({ plugin: 'once' })).toThrow(
			"Page.use lists a value no plugin's entry returned.",
		)
		expect(() => using(called(once.use), called(once.use))).toThrow(
			'Page.use lists once twice.',
		)
	})

	it('refuses an added field that clashes', () => {
		const adding = addingFields
		expect(() => using(adding('a', titleField))).toThrow(
			'Page.title: a adds a field Page already has.',
		)
		expect(() => using(adding('a', atField), adding('b', atField))).toThrow(
			'Page.at: b adds a field a already has.',
		)
		expect(() => using(adding('a', idField))).toThrow(
			'Page.id: the kernel owns this name.',
		)
		expect(() => using(adding('a', null))).toThrow(
			'Page: a.addedFields must return an object of fields.',
		)
		expect(() => using(adding('a', { at: 'dateTime' }))).toThrow(
			'Page.at is not a field a builder returned.',
		)
	})

	it('refuses commands that clash or are not functions', () => {
		const adding = addingCommands
		expect(() => using(adding('a', null))).toThrow(
			new TypeError('a.commands returns an object.'),
		)
		expect(() => using(adding('a', { findMany: () => 1 }))).toThrow(
			'Page.findMany: a adds a command named after a model method.',
		)
		expect(() => using(adding('a', { with: () => 1 }))).toThrow(
			'Page.with: a adds a command named after a model method.',
		)
		const twice = { go: () => 1 }
		expect(() => using(adding('a', twice), adding('b', twice))).toThrow(
			'Page.go: a and b both add this command.',
		)
		expect(() => using(adding('a', { go: 1 }))).toThrow(
			new TypeError('Page.go is a function or an object of functions.'),
		)
		expect(() => using(adding('a', { go: { run: 1 } }))).toThrow(
			new TypeError('Page.go is a function or an object of functions.'),
		)
	})

	it('refuses two plugins that redirect delete', () => {
		expect(() => using(redirecting('a'), redirecting('b'))).toThrow(
			'Page: a and b both redirect delete.',
		)
	})
})

describe('start', () => {
	it('refuses plugins that are not installed as the models need', async () => {
		const solo = loose({ name: 'solo' })
		await expect(startLoose([{ name: 'solo' }])).rejects.toThrow(
			'plugins lists a value that no plugin returned.',
		)
		const twin = loose({ name: 'solo' })
		await expect(
			startLoose([called(solo.plugin), called(twin.plugin)]),
		).rejects.toThrow('plugins lists two plugins named solo.')
		const Page = using(called(solo.use))
		await expect(startLoose([], [Page])).rejects.toThrow(
			'Page uses solo, which is not in plugins.',
		)
		await expect(startLoose([called(twin.plugin)], [Page])).rejects.toThrow(
			'Page uses a solo from another definePlugin than the one in plugins.',
		)
		await expect(startLoose([called(solo.plugin)], [Page])).resolves.toBe(
			undefined,
		)
	})

	it('refuses an unmet requirement or plugins that need each other', async () => {
		await expect(startLoose([needs('a', 'b')])).rejects.toThrow(
			'a requires b, which is not in plugins.',
		)
		await expect(
			startLoose([needs('a', 'b'), needs('b', 'a')]),
		).rejects.toThrow('plugins need each other: a → b → a.')
	})
})

interface Lens extends PluginTypes {
	readonly name: 'lens'
	readonly with: { readonly plural: string } | false
}
let seen: readonly ExposedModel<Lens['with']>[] = []
const lens = definePlugin<Lens>({
	name: 'lens',
	manifest,
	api: ({ models }) => {
		seen = models
	},
})
const Tag = defineModel({
	name: 'Tag',
	use: [lens.use()],
	fields: (f) => ({
		label: f.string({ unique: true }),
		kind: f.string({ default: 'plain' }),
		secret: f.string({ optional: true }).with({
			access: { read: allow.private },
		}),
		note: f.string({ optional: true }).with({
			access: { read: ({ caller }) => caller.kind === 'user' },
		}),
	}),
}).with({ lens: { plural: 'tagz' } })
const Secret = defineModel({
	name: 'Secret',
	use: [lens.use()],
	fields: (f) => ({ text: f.string(), tags: f.string({ list: true }) }),
}).with({ lens: false })
defineModel({
	name: 'Typed',
	use: [lens.use()],
	fields: (f) => ({ text: f.string() }),
	// @ts-expect-error -- the plugin types its key: `plural` is a string.
}).with({ lens: { plural: 1 } })
const Plain = defineModel({
	name: 'Plain',
	fields: (f) => ({ text: f.string() }),
})

describe('a plugin’s models', () => {
	it('gives each model’s schema, uniques, required fields, its .with key, whether it uses the plugin, and queries', async () => {
		const lensed = defineApp({
			database: memory(),
			plugins: [lens.plugin()],
			models: [Tag, Secret, Plain],
		})
		await lensed.start()
		try {
			expect(seen.map((model) => model.schema.name)).toEqual([
				'Tag',
				'Secret',
				'Plain',
			])
			expect(seen.map((model) => model.with)).toEqual([
				{ plural: 'tagz' },
				false,
				undefined,
			])
			expect(seen.map((model) => model.used)).toEqual([true, true, false])
			expect(seen[0]?.uniques).toEqual([['id'], ['label']])
			expect(seen[0]?.readRules).toEqual({ secret: 'private', note: 'rule' })
			expect(seen[1]?.readRules).toEqual({})
			// Neither optional nor with a default, as `create`'s type (D-53);
			// a list is [] when left out (D-120).
			expect(seen[0]?.required).toEqual(['label'])
			expect(seen[1]?.required).toEqual(['text'])
			const queries = seen[0]?.queries
			const created = await queries?.create({ data: { label: 'a' } }, M)
			expect(created?.['label']).toBe('a')
			expect(await Tag.count({}, M)).toBe(1)
			expect(Object.isFrozen(seen[0])).toBe(true)
		} finally {
			await lensed.stop()
		}
	})
})
