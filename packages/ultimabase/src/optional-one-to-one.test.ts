// A one-to-one whose two sides are optional (D-233): the side naming
// `onDelete` stores a unique key that may be empty, and writes from the
// other side move it.
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	expectTypeOf,
	it,
} from 'vitest'
import { defineApp, defineModel, master, memory } from './index.ts'
import { resolve } from './schema.ts'

const M = { as: master }

const Team = defineModel({
	name: 'Team',
	fields: (f) => ({
		name: f.string(),
		channel: f.one(() => Channel, { optional: true }),
	}),
})

/** Stores the key: it names `onDelete`. */
const Channel = defineModel({
	name: 'Channel',
	fields: (f) => ({
		topic: f.string(),
		team: f.one(() => Team, { optional: true, onDelete: 'setNull' }),
	}),
}).with({
	access: {
		read: () => true,
		delete: ({ record }) => {
			expectTypeOf(record.team).toEqualTypeOf<{
				readonly id: string
			} | null>()
			return true
		},
	},
})

const teamOf = async (id: string) =>
	(await Channel.findUnique({ where: { id }, include: { team: true } }, M))
		?.team?.id ?? null

describe('an optional one-to-one', () => {
	it('stores a unique key that may be empty on the side naming onDelete', () => {
		const { schema } = resolve([Team, Channel])
		const field = (model: string, name: string) =>
			schema.models
				.find((each) => each.name === model)
				?.fields.find((each) => each.name === name)
		expect(field('Channel', 'team')).toMatchObject({
			stored: true,
			unique: true,
			optional: true,
			onDelete: 'setNull',
		})
		expect(field('Team', 'channel')).toMatchObject({ stored: false })
	})

	it('needs exactly one side naming onDelete', () => {
		const Desk = defineModel({
			name: 'Desk',
			fields: (f) => ({ lamp: f.one(() => Lamp, { optional: true }) }),
		})
		const Lamp = defineModel({
			name: 'Lamp',
			fields: (f) => ({ desk: f.one(() => Desk, { optional: true }) }),
		})
		expect(() => resolve([Desk, Lamp])).toThrow(
			'Desk.lamp and Lamp.desk: make one side of the one-to-one required, or give the side that stores the key onDelete.',
		)
		const Seat = defineModel({
			name: 'Seat',
			fields: (f) => ({
				pad: f.one(() => Pad, { optional: true, onDelete: 'setNull' }),
			}),
		})
		const Pad = defineModel({
			name: 'Pad',
			fields: (f) => ({
				seat: f.one(() => Seat, { optional: true, onDelete: 'cascade' }),
			}),
		})
		expect(() => resolve([Seat, Pad])).toThrow(
			'Seat.pad and Pad.seat: only one side of a one-to-one stores the key; keep onDelete on that one.',
		)
	})

	describe('written from the side without the key', () => {
		const app = defineApp({ database: memory(), models: [Team, Channel] })
		beforeEach(async () => app.start())
		afterEach(async () => app.stop())

		it('creates the row that stores the key', async () => {
			const team = await Team.create(
				{
					data: { name: 'core', channel: { create: { topic: 'general' } } },
					include: { channel: true },
				},
				M,
			)
			expect(team.channel?.topic).toBe('general')
			expect(await teamOf(team.channel?.id ?? '')).toBe(team.id)
		})

		it('moves the key, emptying the row that held it', async () => {
			const one = await Channel.create({ data: { topic: 'one' } }, M)
			const two = await Channel.create({ data: { topic: 'two' } }, M)
			const team = await Team.create(
				{ data: { name: 'core', channel: { connect: { id: one.id } } } },
				M,
			)
			await Team.update(
				{
					where: { id: team.id },
					data: { channel: { connect: { id: two.id } } },
				},
				M,
			)
			expect(await teamOf(one.id)).toBeNull()
			expect(await teamOf(two.id)).toBe(team.id)
			const other = await Team.create(
				{ data: { name: 'web', channel: { connect: { id: two.id } } } },
				M,
			)
			expect(await teamOf(two.id)).toBe(other.id)
			await Team.update(
				{
					where: { id: other.id },
					data: { channel: { create: { topic: 'new' } } },
				},
				M,
			)
			expect(await teamOf(two.id)).toBeNull()
			expect(await Channel.count({ where: { team: { is: null } } }, M)).toBe(2)
		})

		it('disconnects, and an empty team disconnects nothing', async () => {
			const team = await Team.create(
				{ data: { name: 'core', channel: { create: { topic: 'general' } } } },
				M,
			)
			await Team.update(
				{ where: { id: team.id }, data: { channel: { disconnect: true } } },
				M,
			)
			expect(await Channel.count({ where: { team: { is: null } } }, M)).toBe(1)
			await Team.update(
				{ where: { id: team.id }, data: { channel: { disconnect: true } } },
				M,
			)
			expect(await Channel.count({ where: { team: { is: null } } }, M)).toBe(1)
		})

		it('empties the key when the team is deleted', async () => {
			const team = await Team.create(
				{ data: { name: 'core', channel: { create: { topic: 'general' } } } },
				M,
			)
			await Team.delete({ where: { id: team.id } }, M)
			expect(await Channel.count({ where: { team: { is: null } } }, M)).toBe(1)
		})

		it('refuses a channel for a team another channel holds', async () => {
			const team = await Team.create(
				{ data: { name: 'core', channel: { create: { topic: 'one' } } } },
				M,
			)
			await expect(
				Channel.create(
					{ data: { topic: 'two', team: { connect: { id: team.id } } } },
					M,
				),
			).rejects.toMatchObject({
				code: 'UNIQUE_VIOLATION',
				message: 'Unique constraint failed on Channel (team).',
			})
		})
	})
})
