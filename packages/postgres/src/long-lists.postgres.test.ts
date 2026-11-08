// A list of values is one parameter (D-325): a statement holds 65535
// parameters at most, and a list may be longer; past them, a statement fails
// saying so (D-326).
import { randomUUID } from 'node:crypto'
import { testApplication } from '@ultimabase/testing'
import { defineApp, defineModel, master } from 'ultimabase'
import { expect, it } from 'vitest'
import { postgres } from './index.ts'

const servers =
	'postgres://postgres:postgres@localhost:54315/postgres postgres://postgres:postgres@localhost:54318/postgres'
const [server = ''] = (process.env['TEST_DATABASE_URL'] ?? servers)
	.split(' ')
	.filter((url) => url !== '')

const M = { as: master }

const Card = defineModel({
	name: 'Card',
	fields: (f) => ({
		title: f.string(),
		at: f.dateTime({ optional: true }),
		done: f.boolean({ optional: true }),
		data: f.json({ optional: true }),
		tags: f.many(() => Tag, { inverse: 'cards' }),
	}),
})

const Tag = defineModel({
	name: 'Tag',
	fields: (f) => ({
		label: f.string(),
		cards: f.many(() => Card, { inverse: 'tags' }),
	}),
})

testApplication(
	defineApp({ database: postgres({ url: server }), models: [Card, Tag] }),
	{ database: 'declared' },
)

/** More values than a statement holds parameters. */
const many = 70_000

const strangers = (): string[] =>
	Array.from({ length: many }, () => randomUUID())

/** The titles of the cards `where` finds, in order. */
async function titles(where: object): Promise<string[]> {
	const rows = await Card.findMany({ where, orderBy: { title: 'asc' } }, M)
	return rows.map(({ title }) => title)
}

it('finds among more ids than a statement holds parameters', async () => {
	const card = await Card.create({ data: { title: 'kept' } }, M)
	await Card.create({ data: { title: 'other' } }, M)
	const id = [...strangers(), card.id]
	expect(await titles({ id: { in: id } })).toEqual(['kept'])
	expect(await titles({ id: { notIn: id } })).toEqual(['other'])
	expect(await Card.count({ where: { id: { in: id } } }, M)).toBe(1)
})

it('finds among as many texts, case ignored', async () => {
	await Card.create({ data: { title: 'Kept' } }, M)
	const title = [...strangers(), 'kEPT', '100%']
	expect(await titles({ title: { in: title, mode: 'insensitive' } })).toEqual([
		'Kept',
	])
})

it('finds a json value among others, whatever its characters', async () => {
	const data = [{ a: 1 }, [1, 'x'], 'a,b"c{}\\', 3, true]
	for (const [at, value] of data.entries()) {
		await Card.create({ data: { title: `${at}`, data: value } }, M)
	}
	await Card.create({ data: { title: 'none' } }, M)
	expect(await titles({ data: { in: data } })).toEqual([
		'0',
		'1',
		'2',
		'3',
		'4',
	])
	expect(await titles({ data: { in: [{ a: 1 }, null, '3'] } })).toEqual(['0'])
})

it('finds a date and a boolean among others', async () => {
	const at = new Date('1900-01-01T00:09:21.5Z')
	await Card.create({ data: { title: 'old', at, done: true } }, M)
	await Card.create({ data: { title: 'new', at: new Date(), done: false } }, M)
	const dates = [at, new Date('2000-01-01T00:00:00Z')]
	expect(await titles({ at: { in: dates } })).toEqual(['old'])
	expect(await titles({ done: { in: [true] } })).toEqual(['old'])
})

it('connects and disconnects more targets than a statement holds', async () => {
	const labels = Array.from({ length: 33_000 }, (_, at) => ({ label: `${at}` }))
	const tags = await Tag.createManyAndReturn({ data: labels }, M)
	const connect = tags.map(({ id }) => ({ id }))
	const card = await Card.create(
		{ data: { title: 'tagged', tags: { connect } } },
		M,
	)
	expect(await Tag.count({ where: { cards: { some: {} } } }, M)).toBe(33_000)
	const disconnect = [...connect, ...strangers().map((id) => ({ id }))]
	await Card.update(
		{ where: { id: card.id }, data: { tags: { disconnect } } },
		M,
	)
	expect(await Tag.count({ where: { cards: { some: {} } } }, M)).toBe(0)
}, 30_000)

it('refuses more conditions than a statement holds, saying why', async () => {
	const card = await Card.create({ data: { title: 'kept' } }, M)
	const OR = [...strangers(), card.id].map((id) => ({ id: { equals: id } }))
	await expect(Card.findMany({ where: { OR } }, M)).rejects.toThrow(
		'A statement binds 65535 values at most, and this one binds 70001',
	)
	expect(await titles({ OR: OR.slice(-40_000) })).toEqual(['kept'])
})
