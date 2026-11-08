// The rows the `after*` hooks of many writes get (D-329): read a few at a
// time while no hook writes, and alone after a write, so a hook sees what an
// earlier hook wrote.
import { afterEach, beforeEach, expect, it } from 'vitest'
import type { Read } from './index.ts'
import { defineApp, defineModel, master, memory } from './index.ts'
import { query } from './engine.ts'

const M = { as: master }
const seen: { title: string; note: string | null }[] = []
const reads: Read[] = []
/** What the hook on `a` does to `b`. */
let touch: 'update' | 'delete' | undefined

const Note = defineModel({
	name: 'Note',
	fields: (f) => ({
		title: f.string(),
		note: f.string({ optional: true }),
		pins: f.many(() => Pin, { inverse: 'note' }),
	}),
}).with({
	hooks: {
		afterCreate: async ({ record }) => {
			seen.push({ title: record.title, note: record.note })
			if (record.title !== 'a' || touch === undefined) return
			const where = { title: { equals: 'b' } }
			if (touch === 'delete') {
				await query('Note', 'deleteMany', { where }, M)
			} else {
				await query('Note', 'updateMany', { where, data: { note: 'b' } }, M)
			}
		},
		afterUpdate: ({ record }) => {
			seen.push({ title: record.title, note: record.note })
		},
	},
})

const Pin = defineModel({
	name: 'Pin',
	fields: (f) => ({
		label: f.string(),
		note: f.one(() => Note, { optional: true }),
	}),
}).with({
	hooks: {
		afterCreate: ({ record }) => {
			seen.push({ title: record.label, note: null })
		},
	},
})

let app: ReturnType<typeof defineApp>

beforeEach(async () => {
	seen.length = 0
	reads.length = 0
	touch = undefined
	const database = memory()
	const begin = database.begin.bind(database)
	database.begin = async (options) => {
		const tx = await begin(options)
		const find = tx.find.bind(tx)
		tx.find = async (read) => {
			reads.push(read)
			return find(read)
		}
		return tx
	}
	app = defineApp({ database, models: [Note, Pin] })
	await app.start()
})
afterEach(async () => {
	await app.stop()
})

const titles = (count: number): { title: string }[] =>
	Array.from({ length: count }, (_, at) => ({ title: `${at}` }))

it('reads the rows of many after hooks a few at a time', async () => {
	await Note.createMany({ data: titles(100) }, M)
	expect(seen.map(({ title }) => title)).toEqual(
		titles(100).map(({ title }) => title),
	)
	// 1, 2, 4, 8, 16, 32 and 37 rows.
	expect(reads).toHaveLength(7)
	reads.length = 0
	seen.length = 0
	await Note.updateMany({ data: { note: 'n' } }, M)
	expect(seen).toHaveLength(100)
	expect(seen.every(({ note }) => note === 'n')).toBe(true)
	// The rows to update, then the same seven reads.
	expect(reads).toHaveLength(8)
})

it('shows a hook what an earlier hook wrote', async () => {
	touch = 'update'
	await Note.createMany({ data: [{ title: 'a' }, { title: 'b' }] }, M)
	expect(seen).toEqual([
		{ title: 'a', note: null },
		// The update's own `afterUpdate`, then `b`'s `afterCreate`.
		{ title: 'b', note: 'b' },
		{ title: 'b', note: 'b' },
	])
})

it('fails as before when a hook deletes a later row', async () => {
	touch = 'delete'
	const data = [{ title: 'a' }, { title: 'b' }, { title: 'c' }]
	await expect(Note.createMany({ data }, M)).rejects.toThrow(
		/^Note [0-9a-f-]{36} was deleted before its after hooks\.$/,
	)
	expect(await Note.count({}, M)).toBe(0)
})

it('reads the rows of each model in a nested write', async () => {
	const pins = { create: [{ label: 'x' }, { label: 'y' }] }
	await Note.create({ data: { title: 'n', pins } }, M)
	expect(seen.map(({ title }) => title).toSorted()).toEqual(['n', 'x', 'y'])
})
