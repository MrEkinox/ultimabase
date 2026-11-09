// A `connectOrCreate` finds its row without the row rules, but its `where`
// obeys the fields' read rules, as a find's does (D-138, D-347): otherwise
// a caller learns who holds a value it may not read.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { asUser } from '@ultimabase/testing'
import { allow, defineApp, defineModel, master, memory } from './index.ts'

const M = { as: master }
const U = { as: asUser({ id: '00000000-0000-4000-8000-0000000000ee' }) }

const Member = defineModel({
	name: 'Member',
	fields: (f) => ({
		name: f.string(),
		email: f.string({ unique: true }).with({ access: allow.private }),
		team: f.one(() => Team, { optional: true }),
	}),
}).with({ access: { read: allow.public, create: allow.private } })

const Note = defineModel({
	name: 'Note',
	fields: (f) => ({
		text: f.string(),
		about: f.one(() => Member, { optional: true }),
	}),
}).with({ access: allow.public })

const Team = defineModel({
	name: 'Team',
	fields: (f) => ({
		members: f.many(() => Member, { inverse: 'team' }),
	}),
}).with({ access: allow.public })

const app = defineApp({ database: memory(), models: [Member, Note, Team] })
beforeEach(async () => app.start())
afterEach(async () => app.stop())

describe('a connectOrCreate on a field the caller may not read', () => {
	it('is refused on a one, and links nothing', async () => {
		await Member.create({ data: { name: 'Vic', email: 'vic@x.io' } }, M)
		const write = Note.create(
			{
				data: {
					text: 'probe',
					about: {
						connectOrCreate: {
							where: { email: 'vic@x.io' },
							create: { name: 'x', email: 'vic@x.io' },
						},
					},
				},
			},
			U,
		)
		await expect(write).rejects.toMatchObject({ code: 'INVALID_QUERY' })
		expect(await Note.findMany({}, M)).toStrictEqual([])
	})

	it('is refused on a many', async () => {
		await Member.create({ data: { name: 'Vic', email: 'vic@x.io' } }, M)
		const write = Team.create(
			{
				data: {
					members: {
						connectOrCreate: [
							{
								where: { email: 'vic@x.io' },
								create: { name: 'x', email: 'vic@x.io' },
							},
						],
					},
				},
			},
			U,
		)
		await expect(write).rejects.toMatchObject({ code: 'INVALID_QUERY' })
	})

	it('links the row it finds for Master', async () => {
		const vic = await Member.create(
			{ data: { name: 'Vic', email: 'vic@x.io' } },
			M,
		)
		const note = await Note.create(
			{
				data: {
					text: 'linked',
					about: {
						connectOrCreate: {
							where: { email: 'vic@x.io' },
							create: { name: 'x', email: 'vic@x.io' },
						},
					},
				},
				include: { about: true },
			},
			M,
		)
		expect(note.about?.id).toBe(vic.id)
	})
})
