// The writes of the contract (D-73): create, update and delete, the links of
// every relation, and the refusals of a unique key and of a missing row.
import type { Adapter } from 'ultimabase'
import { defineApp, defineModel, master } from 'ultimabase'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { silent } from './silent.ts'

const M = { as: master }

const Team = defineModel({
	name: 'Team',
	fields: (f) => ({
		name: f.string({ unique: true }),
		players: f.many(() => Player),
	}),
})

const Player = defineModel({
	name: 'Player',
	fields: (f) => ({
		name: f.string(),
		score: f.number({ default: 0 }),
		active: f.boolean({ default: true }),
		bio: f.string({ optional: true }),
		stats: f.json({ optional: true }),
		bornAt: f.date({ optional: true }),
		team: f.one(() => Team, { optional: true }),
		badge: f.one(() => Badge, { optional: true }),
		skills: f.many(() => Skill),
	}),
	indexes: [{ fields: ['name', 'team'], unique: true }],
})

const Badge = defineModel({
	name: 'Badge',
	fields: (f) => ({ code: f.string(), player: f.one(() => Player) }),
})

const Skill = defineModel({
	name: 'Skill',
	fields: (f) => ({
		label: f.string({ unique: true }),
		players: f.many(() => Player),
	}),
})

const skillsOf = async (id: string): Promise<string[]> =>
	(
		await Skill.findMany(
			{ where: { players: { some: { id } } }, orderBy: { label: 'asc' } },
			M,
		)
	).map((skill) => skill.label)
const skill = async (label: string) => Skill.create({ data: { label } }, M)

export function writes(create: () => Adapter): void {
	const started = () =>
		defineApp({
			database: create(),
			models: [Team, Player, Badge, Skill],
			logger: silent,
		})
	describe('writes', () => {
		let app: ReturnType<typeof started>
		beforeEach(async () => {
			app = started()
			await app.start()
		})
		afterEach(async () => app.stop())

		it('creates a row and returns it as stored', async () => {
			const bornAt = new Date(Date.UTC(1990, 4, 17, 8, 30, 15, 250))
			const created = await Player.create(
				{ data: { name: 'Ada', stats: { goals: [1, 2], ok: true }, bornAt } },
				M,
			)
			expect(created).toMatchObject({
				name: 'Ada',
				score: 0,
				active: true,
				bio: null,
				stats: { goals: [1, 2], ok: true },
				bornAt,
			})
			expect(created.createdAt).toBeInstanceOf(Date)
			expect(await Player.findUnique({ where: { id: created.id } }, M)).toEqual(
				created,
			)
		})

		it('updates values, to null too, and moves updatedAt', async () => {
			const ada = await Player.create(
				{ data: { name: 'Ada', bio: 'Poet', score: 1.5 } },
				M,
			)
			const updated = await Player.update(
				{
					where: { id: ada.id },
					data: { bio: null, score: -2, active: false },
				},
				M,
			)
			expect(updated).toMatchObject({ bio: null, score: -2, active: false })
			expect(updated.createdAt).toEqual(ada.createdAt)
			expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(
				ada.updatedAt.getTime(),
			)
			expect(await Player.findUnique({ where: { id: ada.id } }, M)).toEqual(
				updated,
			)
		})

		it('deletes a row and returns it', async () => {
			const ada = await Player.create({ data: { name: 'Ada' } }, M)
			expect(await Player.delete({ where: { id: ada.id } }, M)).toEqual(ada)
			expect(await Player.count({}, M)).toBe(0)
			await expect(
				Player.delete({ where: { id: ada.id } }, M),
			).rejects.toMatchObject({ code: 'NOT_FOUND' })
		})

		it('connects and disconnects a one-to-many', async () => {
			const team = await Team.create({ data: { name: 'Reds' } }, M)
			const ada = await Player.create(
				{ data: { name: 'Ada', team: { connect: { id: team.id } } } },
				M,
			)
			const reds = await Team.findUnique(
				{ where: { id: team.id }, include: { players: true } },
				M,
			)
			expect(reds).toMatchObject({ players: [{ id: ada.id }] })
			await Player.update(
				{ where: { id: ada.id }, data: { team: { disconnect: true } } },
				M,
			)
			expect(await Player.count({ where: { team: { is: null } } }, M)).toBe(1)
		})

		it('connects a one-to-one from either side', async () => {
			const ada = await Player.create({ data: { name: 'Ada' } }, M)
			const badge = await Badge.create(
				{ data: { code: 'A1', player: { connect: { id: ada.id } } } },
				M,
			)
			const found = await Player.findUnique(
				{ where: { id: ada.id }, include: { badge: true } },
				M,
			)
			expect(found).toMatchObject({ badge: { id: badge.id } })
			const grace = await Player.create(
				{ data: { name: 'Grace', badge: { connect: { id: badge.id } } } },
				M,
			)
			const moved = await Badge.findUnique(
				{ where: { id: badge.id }, include: { player: true } },
				M,
			)
			expect(moved).toMatchObject({ player: { id: grace.id } })
		})

		it('links and unlinks a many-to-many, and unlinks a deleted row', async () => {
			const math = await skill('math')
			const art = await skill('art')
			const chess = await skill('chess')
			const ada = await Player.create(
				{
					data: {
						name: 'Ada',
						skills: {
							connect: [{ id: math.id }, { id: art.id }],
						},
					},
				},
				M,
			)
			expect(await skillsOf(ada.id)).toEqual(['art', 'math'])
			await Player.update(
				{
					where: { id: ada.id },
					data: {
						skills: {
							connect: [{ id: chess.id }],
							disconnect: [{ id: math.id }],
						},
					},
				},
				M,
			)
			expect(await skillsOf(ada.id)).toEqual(['art', 'chess'])
			await Skill.delete({ where: { id: art.id } }, M)
			expect(await skillsOf(ada.id)).toEqual(['chess'])
			await Player.delete({ where: { id: ada.id } }, M)
			expect(await Skill.count({ where: { players: { some: {} } } }, M)).toBe(0)
		})

		it('refuses a second row with a unique field or index, and keeps the first', async () => {
			const team = await Team.create({ data: { name: 'Reds' } }, M)
			await expect(
				Team.create({ data: { name: 'Reds' } }, M),
			).rejects.toMatchObject({
				code: 'UNIQUE_VIOLATION',
				details: { model: 'Team', fields: ['name'] },
			})
			const data = { name: 'Ada', team: { connect: { id: team.id } } }
			await Player.create({ data }, M)
			await expect(Player.create({ data }, M)).rejects.toMatchObject({
				code: 'UNIQUE_VIOLATION',
				details: { model: 'Player', fields: ['name', 'team'] },
			})
			const grace = await Player.create({ data: { name: 'Grace' } }, M)
			await expect(
				Player.update(
					{ where: { id: grace.id }, data: { name: 'Ada', team: data.team } },
					M,
				),
			).rejects.toMatchObject({ code: 'UNIQUE_VIOLATION' })
			expect(await Team.count({}, M)).toBe(1)
			expect(
				await Player.count({ where: { name: 'Grace', team: { is: null } } }, M),
			).toBe(1)
		})

		it('refuses to connect a missing row, and writes nothing', async () => {
			const created = Player.create(
				{ data: { name: 'Ada', team: { connect: { id: 'missing' } } } },
				M,
			)
			await expect(created).rejects.toMatchObject({ code: 'NOT_FOUND' })
			expect(await Player.count({}, M)).toBe(0)
		})
	})
}
