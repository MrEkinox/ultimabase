// A plugin's stored value rewritten through the running adapter (D-366): no
// hook runs, `updatedAt` stays, the feed sees the write, and a row written or
// deleted since the read is left as it is.
import { afterEach, expect, it } from 'vitest'
import type { Changed } from './adapter.ts'
import {
	defineApp,
	defineModel,
	definePlugin,
	master,
	memory,
} from './index.ts'
import { storedFields } from './internal.ts'

const M = { as: master }
const hooks: string[] = []
const Note = defineModel({
	name: 'Note',
	fields: (f) => ({ text: f.string(), data: f.json({ optional: true }) }),
}).with({
	hooks: {
		beforeUpdate: () => {
			hooks.push('beforeUpdate')
		},
		afterUpdate: () => {
			hooks.push('afterUpdate')
		},
	},
})

const fed: Changed[] = []
const watching = definePlugin({
	name: 'watching',
	manifest: {
		name: 'watching',
		version: '1.0.0',
		peerDependencies: { ultimabase: '*' },
	},
	changed: (changes) => {
		fed.push(...changes)
	},
})

let stop: (() => Promise<void>) | undefined
afterEach(async () => {
	await stop?.()
	stop = undefined
	hooks.length = 0
	fed.length = 0
})

async function started() {
	const app = defineApp({
		database: memory(),
		models: [Note],
		plugins: [watching.plugin()],
	})
	await app.start()
	stop = async () => app.stop()
	return Note.create({ data: { text: 'a', data: { n: 1 } } }, M)
}

it('reads the stored field of the rows found, by id', async () => {
	const note = await started()
	const found = await storedFields('Note', 'data', [note.id, 'nothing'])
	expect([...found.keys()]).toStrictEqual([note.id])
	expect(found.get(note.id)?.value).toStrictEqual({ n: 1 })
	expect((await storedFields('Note', 'data', [])).size).toBe(0)
})

it('writes without hooks, keeps updatedAt, and feeds the write', async () => {
	const note = await started()
	const found = await storedFields('Note', 'data', [note.id])
	expect(await found.get(note.id)?.write({ n: 2 })).toBe(true)
	const read = await Note.findUnique({ where: { id: note.id } }, M)
	expect(read?.data).toStrictEqual({ n: 2 })
	expect(read?.updatedAt).toStrictEqual(note.updatedAt)
	expect(hooks).toStrictEqual([])
	await new Promise((done) => setImmediate(done))
	expect(fed.at(-1)).toMatchObject({
		kind: 'update',
		model: 'Note',
		ids: [note.id],
	})
})

it('leaves a row written or deleted since the read', async () => {
	const note = await started()
	const other = await Note.create({ data: { text: 'b' } }, M)
	const found = await storedFields('Note', 'data', [note.id, other.id])
	await Note.update({ where: { id: note.id }, data: { text: 'c' } }, M)
	await Note.delete({ where: { id: other.id } }, M)
	expect(await found.get(note.id)?.write({ n: 2 })).toBe(false)
	expect(await found.get(other.id)?.write({ n: 2 })).toBe(false)
	const read = await Note.findUnique({ where: { id: note.id } }, M)
	expect(read?.data).toStrictEqual({ n: 1 })
})

it('needs a running application', async () => {
	await expect(storedFields('Note', 'data', [])).rejects.toThrow(
		'No application is running.',
	)
})
