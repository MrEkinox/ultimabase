// `createMany` (D-135): a create's rules, defaults, validation and hooks on
// each row of `data`, all or nothing, in one write.
import { asUser } from '@ultimabase/testing'
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	expectTypeOf,
	it,
} from 'vitest'
import { z } from 'zod'
import type { Adapter, ArgsOf } from './index.ts'
import { defineApp, defineModel, master, memory } from './index.ts'
import { query } from './engine.ts'

const M = { as: master }
const me = '00000000-0000-4000-8000-000000000000'
const user = { as: asUser({ id: me }) }
const log: string[] = []

/** A user creates the notes they own. */
const Note = defineModel({
	name: 'Note',
	fields: (f) => ({
		text: f.string({ unique: true, validate: z.string().min(1) }),
		owner: f.string(),
		pinned: f.boolean({ default: false }),
		folder: f.one(() => Folder, { optional: true }),
		tags: f.many(() => Label),
	}),
}).with({
	access: {
		read: () => true,
		create: ({ caller, value }) =>
			caller.kind === 'user' && caller.user.id === value.owner,
	},
	hooks: {
		beforeCreate: ({ data }) => {
			log.push(`beforeCreate ${data.text}`)
			if (data.text === 'loud') data.text = 'LOUD'
		},
		afterCreate: ({ record }) => {
			log.push(`afterCreate ${record.text}`)
		},
		afterCreateCommit: ({ record }) => {
			log.push(`afterCreateCommit ${record.text}`)
		},
	},
})

const Folder = defineModel({
	name: 'Folder',
	fields: (f) => ({ name: f.string(), notes: f.many(() => Note) }),
}).with({ access: { read: () => true } })

const Label = defineModel({
	name: 'Label',
	fields: (f) => ({ name: f.string(), notes: f.many(() => Note) }),
})

const texts = async () =>
	(await Note.findMany({ orderBy: { text: 'asc' } }, M)).map(
		(note) => `${note.text} ${String(note.pinned)}`,
	)

// Never called: checks what the types refuse (D-135).
async function refused(folder: string) {
	// @ts-expect-error -- a many relation is not written
	await Note.createMany({ data: { text: 'a', owner: me, tags: {} } }, M)
	await Note.createMany(
		// @ts-expect-error -- a one relation is only connected
		{ data: [{ text: 'a', owner: me, folder: { create: { name: 'x' } } }] },
		M,
	)
	await Note.createMany(
		{ data: [{ text: 'a', owner: me, folder: { connect: { id: folder } } }] },
		M,
	)
}

describe('createMany', () => {
	let app: ReturnType<typeof defineApp>
	beforeEach(async () => {
		log.length = 0
		app = defineApp({ database: memory(), models: [Note, Folder, Label] })
		await app.start()
	})
	afterEach(async () => app.stop())

	it('creates each row with its defaults and hooks, all rules first', async () => {
		const folder = await Folder.create({ data: { name: 'inbox' } }, M)
		const data = [
			{ text: 'a', owner: me, folder: { connect: { id: folder.id } } },
			{ text: 'loud', owner: me, pinned: true },
		]
		expect(await Note.createMany({ data }, user)).toEqual({ count: 2 })
		expect(log).toEqual([
			'beforeCreate a',
			'beforeCreate loud',
			'afterCreate a',
			'afterCreate LOUD',
			'afterCreateCommit a',
			'afterCreateCommit LOUD',
		])
		expect(await texts()).toEqual(['LOUD true', 'a false'])
		const inbox = await Folder.findUniqueOrThrow(
			{ where: { id: folder.id }, include: { notes: true } },
			M,
		)
		expect(inbox.notes.map((note) => note.text)).toEqual(['a'])
		expectTypeOf(refused).toBeFunction()
		expectTypeOf<{
			data: { text: string; owner: string }
		}>().toExtend<ArgsOf<typeof Note, 'createMany'>>()
	})

	it('takes one row, and an empty list writes nothing', async () => {
		expect(
			await Note.createMany({ data: { text: 'one', owner: me } }, M),
		).toEqual({ count: 1 })
		log.length = 0
		expect(await Note.createMany({ data: [] }, M)).toEqual({ count: 0 })
		expect(log).toEqual([])
		expect(await texts()).toEqual(['one false'])
	})

	it('writes no row when one is refused, invalid or a duplicate', async () => {
		const other = '11111111-1111-4111-8111-111111111111'
		const theirs = [
			{ text: 'a', owner: me },
			{ text: 'b', owner: other },
		]
		await expect(Note.createMany({ data: theirs }, user)).rejects.toMatchObject(
			{ code: 'ACCESS_DENIED' },
		)
		expect(log).toEqual([])
		const invalid = [
			{ text: 'a', owner: me },
			{ text: '', owner: me },
		]
		await expect(
			Note.createMany({ data: invalid }, user),
		).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
		const twice = [
			{ text: 'a', owner: me },
			{ text: 'a', owner: me },
		]
		await expect(Note.createMany({ data: twice }, user)).rejects.toMatchObject({
			code: 'UNIQUE_VIOLATION',
		})
		expect(await texts()).toEqual([])
	})

	it('checks the connected rows in one count, however many rows', async () => {
		const counts: number[][] = []
		const base = memory()
		const database: Adapter = {
			...base,
			begin: async (options) => {
				const tx = await base.begin(options)
				return {
					...tx,
					write: async (write) => {
						counts.push((write.checks ?? []).map((check) => check.count))
						return tx.write(write)
					},
				}
			},
		}
		await app.stop()
		app = defineApp({ database, models: [Note, Folder, Label] })
		await app.start()
		const [inbox, done] = await Folder.createManyAndReturn(
			{ data: [{ name: 'inbox' }, { name: 'done' }] },
			M,
		)
		const folders = [inbox, done, inbox].map((folder) => folder?.id ?? '')
		counts.length = 0
		const data = folders.map((id, at) => ({
			text: `n${at}`,
			owner: me,
			folder: { connect: { id } },
		}))
		expect(await Note.createMany({ data }, M)).toEqual({ count: 3 })
		// Once per row, 3 counts: thousands put a statement past its limit.
		expect(counts).toEqual([[2]])
		const gone = { text: 'x', owner: me, folder: { connect: { id: me } } }
		const missing = [...data.slice(0, 2), gone]
		await expect(Note.createMany({ data: missing }, M)).rejects.toMatchObject({
			code: 'NOT_FOUND',
			message: 'A connected Folder does not exist.',
		})
	})

	it('refuses nested writes, with the row they are in', async () => {
		const create = async (data: unknown) =>
			query('Note', 'createMany', { data }, M)
		const row = { text: 'a', owner: me }
		await expect(
			create([row, { ...row, tags: { connect: [] } }]),
		).rejects.toMatchObject({
			code: 'INVALID_QUERY',
			message:
				'data.1.tags is a many relation, which createMany does not write.',
		})
		await expect(
			create({ ...row, folder: { create: { name: 'x' } } }),
		).rejects.toMatchObject({
			code: 'INVALID_QUERY',
			message: 'data.folder takes only connect in createMany.',
		})
		await expect(create([{ ...row, nope: 1 }])).rejects.toMatchObject({
			code: 'INVALID_QUERY',
		})
		await expect(
			query('Note', 'createMany', { data: [row], select: {} }, M),
		).rejects.toMatchObject({ code: 'INVALID_QUERY' })
		expect(await texts()).toEqual([])
	})
})
