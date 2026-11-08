// The deepest json value (D-330): PostgreSQL stores, returns and compares
// one 1000 levels deep, which the kernel takes; past it, the kernel refuses.
import { testApplication } from '@ultimabase/testing'
import type { JsonValue } from 'ultimabase'
import { defineApp, defineModel, master } from 'ultimabase'
import { expect, it } from 'vitest'
import { postgres } from './index.ts'

const servers =
	'postgres://postgres:postgres@localhost:54315/postgres postgres://postgres:postgres@localhost:54318/postgres'
const [server = ''] = (process.env['TEST_DATABASE_URL'] ?? servers)
	.split(' ')
	.filter((url) => url !== '')

const M = { as: master }

const Note = defineModel({
	name: 'Note',
	fields: (f) => ({ title: f.string(), data: f.json({ optional: true }) }),
})

testApplication(
	defineApp({ database: postgres({ url: server }), models: [Note] }),
	{
		database: 'declared',
	},
)

/** A json value `levels` deep, arrays and objects in turn: an array when odd. */
function deep(levels: number): JsonValue {
	let value: JsonValue = 1
	for (let level = 0; level < levels; level += 1) {
		value = level % 2 === 0 ? [value] : { a: value }
	}
	return value
}

it('stores, returns and finds a json value 1000 levels deep', async () => {
	const note = await Note.create(
		{ data: { title: 'deep', data: deep(1000) } },
		M,
	)
	await Note.create({ data: { title: 'other', data: deep(999) } }, M)
	expect(note.data).toEqual(deep(1000))
	const read = await Note.findUniqueOrThrow({ where: { id: note.id } }, M)
	expect(read.data).toEqual(deep(1000))
	const found = await Note.findMany(
		{ where: { data: { equals: deep(1000) } } },
		M,
	)
	expect(found.map(({ title }) => title)).toEqual(['deep'])
	const inner = await Note.findMany(
		{ where: { data: { path: ['a'], equals: deep(999) } } },
		M,
	)
	expect(inner.map(({ title }) => title)).toEqual(['deep'])
})

it('refuses one 1001 levels deep before PostgreSQL reads it', async () => {
	await expect(
		Note.create({ data: { title: 'x', data: deep(1001) } }, M),
	).rejects.toMatchObject({
		details: {
			issues: [
				{
					path: ['data'],
					message: 'Expected JSON data nested at most 1000 levels deep.',
				},
			],
		},
	})
	expect(await Note.count({}, M)).toBe(0)
})
