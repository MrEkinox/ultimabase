// A plugin's own models (D-110): resolved and stored with the application's,
// given to no plugin, related only to each other, and named once.
import { describe, expect, it } from 'vitest'
import type { ExposedModel, PluginTypes } from './index.ts'
import {
	defineApp,
	defineFunction,
	defineModel,
	definePlugin,
	master,
	memory,
} from './index.ts'
import { schemaOf } from './lifecycle.ts'

const M = { as: master }
const manifest = {
	name: 'test-plugin',
	version: '1.0.0',
	peerDependencies: { ultimabase: '*' },
}

const Ticket = defineModel({
	name: 'KeeperTicket',
	fields: (f) => ({
		userId: f.string(),
		notes: f.many(() => TicketNote),
	}),
	indexes: [{ fields: ['userId'] }],
})
const TicketNote = defineModel({
	name: 'KeeperTicketNote',
	fields: (f) => ({
		text: f.string(),
		ticket: f.one(() => Ticket, { onDelete: 'cascade' }),
	}),
})

/** The models each plugin's `start` was given, by plugin. */
const seen = new Map<string, readonly string[]>()
const names = (models: readonly ExposedModel[]) =>
	models.map((model) => model.schema.name)

interface Keeper extends PluginTypes {
	readonly name: 'keeper'
}
const keeper = definePlugin<Keeper>({
	name: 'keeper',
	manifest,
	models: [Ticket, TicketNote],
	hooks: {
		// What a row of a model using keeper owns goes with it (D-110).
		afterDelete: async ({ record }) => {
			await Ticket.deleteMany({ where: { userId: record.id } }, M)
		},
	},
	start: ({ models }) => {
		seen.set('keeper', names(models))
	},
})
interface Watcher extends PluginTypes {
	readonly name: 'watcher'
}
const watcher = definePlugin<Watcher>({
	name: 'watcher',
	manifest,
	start: ({ models }) => {
		seen.set('watcher', names(models))
	},
})

const User = defineModel({
	name: 'User',
	use: [keeper.use()],
	fields: (f) => ({ name: f.string() }),
})

describe('a plugin’s own models', () => {
	it('are stored and queried, and given to no plugin', async () => {
		const app = defineApp({
			database: memory(),
			plugins: [keeper.plugin(), watcher.plugin()],
			models: [User],
		})
		await app.start()
		try {
			expect(seen.get('keeper')).toEqual(['User'])
			expect(seen.get('watcher')).toEqual(['User'])
			const ada = await User.create({ data: { name: 'ada' } }, M)
			const ticket = await Ticket.create({ data: { userId: ada.id } }, M)
			await TicketNote.create(
				{ data: { text: 'first', ticket: { connect: { id: ticket.id } } } },
				M,
			)
			const read = await Ticket.findUnique(
				{
					where: { id: ticket.id },
					select: { notes: { select: { text: true } } },
				},
				M,
			)
			expect(read).toEqual({ notes: [{ text: 'first' }] })
			// Closed without a rule, as every model (D-04).
			const anonymous = { as: { kind: 'anonymous' } } as const
			expect(await Ticket.findMany({}, anonymous)).toEqual([])
			await expect(
				Ticket.create({ data: { userId: ada.id } }, anonymous),
			).rejects.toThrow('KeeperTicket create refused.')
			await User.delete({ where: { id: ada.id } }, M)
			expect(await Ticket.count({}, M)).toBe(0)
		} finally {
			await app.stop()
		}
	})

	it('are in the schema migrations read', () => {
		const schema = schemaOf({
			database: memory(),
			plugins: [keeper.plugin()],
			models: [User],
		})
		expect(schema.models.map((model) => model.name)).toEqual([
			'User',
			'KeeperTicket',
			'KeeperTicketNote',
		])
	})
})

/** Calls `target[key]()`, for values the types refuse. */
const call = (target: unknown, key: string): unknown => {
	const fn: unknown = Reflect.get(Object(target), key)
	if (typeof fn !== 'function') throw new TypeError(`No ${key}.`)
	const value: unknown = Reflect.apply(fn, target, [])
	return value
}

/** The message `start` stops with, or `undefined`. */
async function refusal(options: {
	readonly plugins: readonly unknown[]
	readonly models?: readonly unknown[]
	readonly functions?: readonly unknown[]
}): Promise<string | undefined> {
	const app: unknown = Reflect.apply(defineApp, undefined, [
		{ database: memory(), models: [], ...options },
	])
	try {
		await call(app, 'start')
	} catch (error) {
		return error instanceof Error ? error.message : String(error)
	}
	await call(app, 'stop')
	return undefined
}

/** A plugin named `name` that lists `models`, ready for `plugins`. */
const owning = (name: string, models: unknown): unknown => {
	const made: unknown = Reflect.apply(definePlugin, undefined, [
		{ name, manifest, models },
	])
	return call(made, 'plugin')
}

describe('a plugin’s own models are refused', () => {
	it('when models is not an array', () => {
		expect(() => owning('broken', Ticket)).toThrow('broken.models is an array.')
	})

	it('when one is no model', async () => {
		const plugins = [owning('broken', [{}])]
		expect(await refusal({ plugins })).toBe(
			'broken.models lists a value that defineModel did not return.',
		)
	})

	it('when one is named like another', async () => {
		const Twin = defineModel({
			name: 'KeeperTicket',
			fields: (f) => ({ text: f.string() }),
		})
		expect(await refusal({ plugins: [keeper.plugin()], models: [Twin] })).toBe(
			"keeper.models lists a model named KeeperTicket, as models lists; name a plugin's models after it.",
		)
		const other = owning('other', [Twin])
		expect(await refusal({ plugins: [keeper.plugin(), other] })).toBe(
			"other.models lists a model named KeeperTicket, as keeper.models lists; name a plugin's models after it.",
		)
		const twice = owning('twice', [Twin, Twin])
		expect(await refusal({ plugins: [twice] })).toBe(
			'twice.models lists two models named KeeperTicket.',
		)
	})

	it('when one relates to the application’s models', async () => {
		const Owner = defineModel({
			name: 'Owner',
			fields: (f) => ({ badges: f.many(() => Badge) }),
		})
		const Badge = defineModel({
			name: 'BadgesBadge',
			fields: (f) => ({ owner: f.one(() => Owner) }),
		})
		const badges = owning('badges', [Badge])
		expect(await refusal({ plugins: [badges], models: [Owner] })).toBe(
			"Owner.badges: a plugin's model relates only to models of the same plugin; keep the id as a scalar.",
		)
	})

	it('when a function returns one', async () => {
		const tickets = defineFunction({
			name: 'tickets',
			output: [Ticket],
			run: () => [],
		})
		expect(
			await refusal({
				plugins: [keeper.plugin()],
				models: [User],
				functions: [tickets],
			}),
		).toBe('tickets returns KeeperTicket, a model of keeper.')
	})
})
