// An application's commands on a model (D-217): typed by its interface, run
// on the server next to the model's queries, refused when a name is taken.
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	expectTypeOf,
	it,
} from 'vitest'
import type { PluginTypes } from './index.ts'
import {
	defineApp,
	defineModel,
	definePlugin,
	master,
	memory,
	transaction,
} from './index.ts'

const M = { as: master }
/** The matches each `afterUpdate` saw end. */
const ended: string[] = []

const Announcement = defineModel({
	name: 'Announcement',
	fields: (f) => ({ kind: f.string(), match: f.one(() => Match) }),
})

interface MatchCommands {
	/** Ends a running match: `false` when it had already ended. */
	end(id: string): Promise<boolean>
	/** Ends every running match, and counts them. */
	endAll(): Promise<number>
}
export const Match = defineModel({
	name: 'Match',
	fields: (f) => ({
		ended: f.boolean({ default: false }),
		announcements: f.many(() => Announcement),
	}),
})
	.with({
		hooks: {
			afterUpdate: ({ record }) => {
				if (record.ended) ended.push(record.id)
			},
		},
	})
	.commands<MatchCommands>(({ queries }) => ({
		end: async (id) =>
			transaction(async () => {
				const { count } = await queries.updateMany(
					{ where: { id, ended: false }, data: { ended: true } },
					M,
				)
				if (count === 0) return false
				const match = { connect: { id } }
				await Announcement.create({ data: { kind: 'end', match } }, M)
				return true
			}),
		endAll: async (): Promise<number> => {
			const running = await queries.findMany({ where: { ended: false } }, M)
			const done = await Promise.all(running.map(({ id }) => Match.end(id)))
			return done.filter(Boolean).length
		},
	}))

interface NoteCommands {
	/** The notes' count, as Master. */
	total(): Promise<number>
}
/** `.commands` before `.with`: each keeps what the other added. */
const Note = defineModel({
	name: 'Note',
	fields: (f) => ({ text: f.string() }),
})
	.commands<NoteCommands>(({ queries }) => ({
		total: async () => queries.count({}, M),
	}))
	.with({ access: { read: ({ where }) => where({ text: 'shown' }) } })

interface Archive extends PluginTypes {
	readonly name: 'archive'
	readonly commands: { readonly archive: () => number }
}
const archive = definePlugin<Archive>({
	name: 'archive',
	manifest: {
		name: 'test-archive',
		version: '1.0.0',
		peerDependencies: { ultimabase: '*' },
	},
	commands: () => ({ archive: () => 1 }),
})

/** A model no application starts, to refuse its commands. */
const page = () =>
	defineModel({
		name: 'Page',
		use: [archive.use()],
		fields: (f) => ({ title: f.string() }),
	})

describe('an application’s commands', () => {
	let stop: (() => Promise<void>) | undefined
	beforeEach(async () => {
		const app = defineApp({
			database: memory(),
			models: [Match, Announcement, Note],
		})
		await app.start()
		stop = async () => app.stop()
		ended.length = 0
	})
	afterEach(async () => stop?.())

	it('runs on the model, next to its queries and its hooks', async () => {
		const match = await Match.create({ data: {} }, M)
		await expect(Match.end(match.id)).resolves.toBe(true)
		await expect(Match.end(match.id)).resolves.toBe(false)
		expect(ended).toStrictEqual([match.id])
		const read = await Match.findUnique(
			{ where: { id: match.id }, include: { announcements: true } },
			M,
		)
		expect(read?.announcements.map(({ kind }) => kind)).toStrictEqual(['end'])
		expectTypeOf<typeof Match.end>().toEqualTypeOf<
			(id: string) => Promise<boolean>
		>()
	})

	it('calls another command through the model', async () => {
		await Match.createMany({ data: [{}, {}, { ended: true }] }, M)
		await expect(Match.endAll()).resolves.toBe(2)
		await expect(Match.count({ where: { ended: false } }, M)).resolves.toBe(0)
	})

	it('keeps the rules of a `.with` after it', async () => {
		await Note.createMany({ data: [{ text: 'shown' }, { text: 'hidden' }] }, M)
		await expect(Note.total()).resolves.toBe(2)
		const notes = await Note.findMany()
		expect(notes.map(({ text }) => text)).toStrictEqual(['shown'])
	})
})

describe('.commands', () => {
	it('needs its interface', () => {
		// @ts-expect-error: name the commands type.
		const Page = page().commands(() => ({ go: () => 1 }))
		expect(Object.isFrozen(Page)).toBe(true)
	})

	it('is called once, with a function returning functions', () => {
		const Page = page()
		const With = Page.commands<{ go(): number }>(() => ({ go: () => 1 }))
		expect(With.go()).toBe(1)
		expect(() => With.commands<object>(() => ({}))).toThrow(
			'Page takes its commands in one `.commands`.',
		)
		expect(() => Page.commands<object>(() => ({}))).toThrow(
			'Page takes its commands in one `.commands`.',
		)
		// @ts-expect-error: it takes a function.
		expect(() => page().commands({})).toThrow('Page.commands takes a function.')
		// @ts-expect-error: it returns an object.
		expect(() => page().commands<object>(() => null)).toThrow(
			'Page.commands returns an object of functions.',
		)
		expect(() => page().commands<{ go: number }>(() => ({ go: 1 }))).toThrow(
			'Page.commands returns an object of functions.',
		)
	})

	it('refuses a name a method or a plugin’s command takes', () => {
		for (const method of ['findMany', 'with', 'paginate', 'commands']) {
			expect(() =>
				page().commands<object>(() => ({ [method]: () => 1 })),
			).toThrow(
				`Page.${method}: the application adds a command named after a model method.`,
			)
		}
		expect(() =>
			page().commands<{ archive(): number }>(() => ({ archive: () => 2 })),
		).toThrow(
			'Page.archive: archive and the application both add this command.',
		)
	})
})
