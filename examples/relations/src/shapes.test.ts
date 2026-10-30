// The other shapes of a relation, written and read from server code as
// Master, each test on a new in-memory database.
import { testApplication } from '@ultimabase/testing'
import { master } from 'ultimabase'
import { expect, it } from 'vitest'
import { app } from './app.ts'
import {
	Branch,
	Card,
	Category,
	Club,
	Member,
	Membership,
	Reader,
	Series,
} from './shapes.ts'

testApplication(app)

it('creates, reads and deletes the card of a member', async () => {
	//#region one-to-one-write
	const ada = await Member.create(
		{ data: { name: 'Ada', card: { create: { number: 'C-1' } } } },
		{ as: master },
	)
	const card = await Card.findUniqueOrThrow(
		{ where: { number: 'C-1' }, include: { member: true } },
		{ as: master },
	)
	expect(card.member?.name).toBe('Ada')
	await Member.update(
		{ where: { id: ada.id }, data: { card: { update: { number: 'C-2' } } } },
		{ as: master },
	)
	// `delete: true` on the optional side deletes the linked card.
	await Member.update(
		{ where: { id: ada.id }, data: { card: { delete: true } } },
		{ as: master },
	)
	//#endregion
	const read = await Member.findUniqueOrThrow(
		{ where: { id: ada.id }, include: { card: true } },
		{ as: master },
	)
	expect(read.card).toBeNull()
	expect(await Card.count({}, { as: master })).toBe(0)
})

it('nests categories, and empties a parent that is deleted', async () => {
	//#region self-write
	const fiction = await Category.create(
		{
			data: {
				name: 'Fiction',
				children: {
					create: [{ name: 'Fantasy' }, { name: 'Science fiction' }],
				},
			},
		},
		{ as: master },
	)
	await Category.delete({ where: { id: fiction.id } }, { as: master })
	const left = await Category.findMany(
		{ orderBy: { name: 'asc' }, include: { parent: true } },
		{ as: master },
	)
	expect(left.map(({ name, parent }) => [name, parent])).toEqual([
		['Fantasy', null],
		['Science fiction', null],
	])
	//#endregion
})

it('unlinks an optional relation', async () => {
	const fiction = await Category.create(
		{ data: { name: 'Fiction', children: { create: [{ name: 'Fantasy' }] } } },
		{ as: master },
	)
	const fantasy = await Category.findFirstOrThrow(
		{ where: { name: 'Fantasy' } },
		{ as: master },
	)
	//#region disconnect-one
	await Category.update(
		{ where: { id: fantasy.id }, data: { parent: { disconnect: true } } },
		{ as: master },
	)
	//#endregion
	const read = await Category.findUniqueOrThrow(
		{ where: { id: fiction.id }, include: { children: true } },
		{ as: master },
	)
	expect(read.children).toEqual([])
})

it('reads the two relations between branches', async () => {
	//#region inverse-read
	const paris = await Branch.create({ data: { city: 'Paris' } }, { as: master })
	await Branch.create(
		{
			data: {
				city: 'Lyon',
				incoming: {
					create: [{ copies: 12, from: { connect: { id: paris.id } } }],
				},
			},
		},
		{ as: master },
	)
	const read = await Branch.findUniqueOrThrow(
		{
			where: { id: paris.id },
			include: { outgoing: { include: { to: true } }, incoming: true },
		},
		{ as: master },
	)
	expect(read.outgoing.map((transfer) => transfer.to?.city)).toEqual(['Lyon'])
	expect(read.incoming).toEqual([])
	//#endregion
})

it('reads the members of a club through their memberships', async () => {
	//#region join-model-write
	const club = await Club.create(
		{ data: { name: 'Thursday readers' } },
		{ as: master },
	)
	await Reader.create(
		{
			data: {
				name: 'Grace',
				memberships: {
					create: [{ role: 'host', club: { connect: { id: club.id } } }],
				},
			},
		},
		{ as: master },
	)
	const read = await Club.findUniqueOrThrow(
		{
			where: { id: club.id },
			include: { memberships: { include: { reader: true } } },
		},
		{ as: master },
	)
	expect(
		read.memberships.map(({ role, reader }) => [reader?.name, role]),
	).toEqual([['Grace', 'host']])
	//#endregion
	expect(await Membership.count({}, { as: master })).toBe(1)
})

it('reads only the released volumes of a series through its view', async () => {
	//#region view-read
	const series = await Series.create(
		{
			data: {
				title: 'Earthsea',
				volumes: {
					create: [
						{ title: 'A Wizard of Earthsea', released: true },
						{ title: 'The Other Wind' },
					],
				},
			},
		},
		{ as: master },
	)
	const read = await Series.findUniqueOrThrow(
		{
			where: { id: series.id },
			include: {
				released: true,
				_count: { select: { volumes: true, released: true } },
			},
		},
		{ as: master },
	)
	expect(read.released.map((volume) => volume.title)).toEqual([
		'A Wizard of Earthsea',
	])
	expect(read._count).toEqual({ volumes: 2, released: 1 })
	//#endregion
})
