// The writes of the contract (D-73): create, update and delete, the links of
// every relation, and the refusals of a unique key, of a missing row and of
// a value PostgreSQL cannot store as written (D-94).
import type { Adapter } from 'ultimabase'
import { defineModel, master } from 'ultimabase'
import { describe, expect, it } from 'vitest'
import { started } from './suite.ts'

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
		bornAt: f.dateTime({ optional: true }),
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
	describe('writes', () => {
		const database = started(create, [Team, Player, Badge, Skill])

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

		it('reads, with before, the rows its delete removed, as they were', async () => {
			const ada = await Player.create({ data: { name: 'Ada' } }, M)
			await Player.create({ data: { name: 'Bob' } }, M)
			const read = { model: 'Player', where: {} }
			const where = { name: { equals: 'Ada' } }
			const removed = await database().write({
				changes: [{ kind: 'delete', model: 'Player', where }],
				read,
				before: true,
			})
			expect(removed).toMatchObject([{ id: ada.id, name: 'Ada' }])
			// Nothing left to remove, or no delete at all: no row (D-104).
			const again = await database().write({
				changes: [{ kind: 'delete', model: 'Player', where }],
				read,
				before: true,
			})
			expect(again).toEqual([])
			expect(
				await database().write({ changes: [], read, before: true }),
			).toEqual([])
			expect(await Player.count({}, M)).toBe(1)
		})

		it('reads, with before and no delete, the rows its update changed', async () => {
			const ada = await Player.create({ data: { name: 'Ada' } }, M)
			await Player.create({ data: { name: 'Bob' } }, M)
			const changed = await database().write({
				changes: [
					{
						kind: 'update',
						model: 'Player',
						where: { name: { equals: 'Ada' } },
						set: { name: 'Eve' },
					},
				],
				read: { model: 'Player', where: {} },
				before: true,
			})
			// As the update left them (D-133).
			expect(changed).toMatchObject([{ id: ada.id, name: 'Eve' }])
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

		it('stores any well-formed text and the dates of years 1 to 9999', async () => {
			const first = new Date('0001-01-01T00:00:00.000Z')
			const last = new Date('9999-12-31T23:59:59.999Z')
			const ada = await Player.create(
				{ data: { name: '😀 Ada', stats: { 'é😀': ['ｚ'] }, bornAt: first } },
				M,
			)
			await Player.create({ data: { name: 'Grace', bornAt: last } }, M)
			expect(
				await Player.findMany({ orderBy: { bornAt: 'asc' } }, M),
			).toMatchObject([
				{ name: '😀 Ada', stats: { 'é😀': ['ｚ'] }, bornAt: first },
				{ name: 'Grace', bornAt: last },
			])
			expect(
				await Player.count({ where: { id: ada.id, bornAt: first } }, M),
			).toBe(1)
		})

		it('refuses a NUL, a lone surrogate or a year outside 1 to 9999', async () => {
			const invalid = { code: 'VALIDATION_FAILED' }
			for (const data of [
				{ name: 'A\0da' },
				{ name: '\uD800' },
				{ name: 'Ada', stats: { 'k\0': 1 } },
				{ name: 'Ada', stats: ['\uDC00'] },
				{ name: 'Ada', bornAt: new Date('0000-12-31T23:59:59.999Z') },
				{ name: 'Ada', bornAt: new Date('+010000-01-01T00:00:00.000Z') },
			]) {
				await expect(Player.create({ data }, M)).rejects.toMatchObject(invalid)
			}
			const query = { code: 'INVALID_QUERY' }
			const late = new Date('+010000-01-01T00:00:00.000Z')
			for (const where of [
				{ name: 'A\0' },
				{ name: { contains: '\uD800' } },
				{ id: { in: ['\0'] } },
				{ bornAt: { lt: late } },
				{ stats: { equals: { a: '\0' } } },
			]) {
				await expect(Player.findMany({ where }, M)).rejects.toMatchObject(query)
			}
			const team = { connect: { id: '\0' } }
			await expect(
				Player.create({ data: { name: 'Ada', team } }, M),
			).rejects.toMatchObject(query)
			expect(await Player.count({}, M)).toBe(0)
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
