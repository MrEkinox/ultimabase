// The deepest json value (D-330): 1000 levels of arrays and objects, read
// without recursion; past them, a write or a filter is refused before the
// stack runs out, for every caller.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { query } from './engine.ts'
import type { JsonValue } from './index.ts'
import { defineApp, defineModel, master, memory } from './index.ts'

const M = { as: master }

const Note = defineModel({
	name: 'Note',
	fields: (f) => ({ title: f.string(), data: f.json({ optional: true }) }),
})

/** A json value `levels` deep, arrays and objects in turn: an array when odd. */
function deep(levels: number): JsonValue {
	let value: JsonValue = 1
	for (let level = 0; level < levels; level += 1) {
		value = level % 2 === 0 ? [value] : { a: value }
	}
	return value
}

const tooDeep = 'Expected JSON data nested at most 1000 levels deep.'
const refused = (at: string) =>
	`${at}: the json value is nested more than 1000 levels deep.`

const find = (where: object) => Note.findMany({ where }, M)
/** Through the engine: the types refuse these values already. */
const findRaw = (data: unknown) =>
	query('Note', 'findMany', { where: { data } }, M)

let app: ReturnType<typeof defineApp> | undefined
beforeAll(async () => {
	app = defineApp({ database: memory(), models: [Note] })
	await app.start()
})
afterAll(async () => app?.stop())

describe('a json value', () => {
	it('nests 1000 levels, written and found', async () => {
		const note = await Note.create(
			{ data: { title: 'deep', data: deep(1000) } },
			M,
		)
		expect(note.data).toEqual(deep(1000))
		const found = await Note.findMany(
			{ where: { data: { equals: deep(1000) } } },
			M,
		)
		expect(found.map(({ id }) => id)).toEqual([note.id])
	})

	it('is refused at the 1001st level, in a create and an update', async () => {
		await expect(
			Note.create({ data: { title: 'x', data: deep(1001) } }, M),
		).rejects.toMatchObject({
			details: { issues: [{ path: ['data'], message: tooDeep }] },
		})
		const note = await Note.create({ data: { title: 'y' } }, M)
		await expect(
			Note.update({ where: { id: note.id }, data: { data: deep(1001) } }, M),
		).rejects.toMatchObject({
			details: { issues: [{ path: ['data'], message: tooDeep }] },
		})
	})

	it('is refused, not out of stack, 100,000 levels deep', async () => {
		await expect(
			Note.create({ data: { title: 'x', data: deep(100_000) } }, M),
		).rejects.toMatchObject({
			details: { issues: [{ path: ['data'], message: tooDeep }] },
		})
	})

	it('is refused at the 1001st level in a filter', async () => {
		await expect(find({ data: deep(100_001) })).rejects.toThrow(
			refused('where.data'),
		)
		await expect(find({ data: { not: deep(1001) } })).rejects.toThrow(
			refused('where.data.not'),
		)
		await expect(find({ data: { in: [1, deep(1001)] } })).rejects.toThrow(
			refused('where.data.in.1'),
		)
		await expect(
			find({ data: { path: ['a'], equals: deep(1001) } }),
		).rejects.toThrow(refused('where.data.equals'))
	})

	it('is still refused for what is not JSON, at any depth', async () => {
		await expect(findRaw([[Number.NaN]])).rejects.toThrow(
			'where.data does not fit Note.data.',
		)
		await expect(
			findRaw({ path: ['a'], equals: { b: [new Date()] } }),
		).rejects.toThrow('where.data.equals must be a JSON value.')
		await expect(
			Note.create({ data: { title: 'x', data: { ['\0']: 1 } } }, M),
		).rejects.toMatchObject({
			details: { issues: [{ path: ['data'] }] },
		})
	})
})
