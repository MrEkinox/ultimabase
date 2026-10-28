// The rows a bulk write returns (D-149): `createManyAndReturn` in the order
// of `data`, `updateManyAndReturn` in `id` order, each as the write left it,
// read in the write or, after a hook, once it ran.
import type { Adapter } from 'ultimabase'
import { defineModel, master } from 'ultimabase'
import { describe, expect, it } from 'vitest'
import { suiteUser } from './as-user.ts'
import { started } from './suite.ts'

const M = { as: master }
const user = { as: suiteUser('00000000-0000-4000-8000-000000000000') }

const Board = defineModel({
	name: 'Board',
	fields: (f) => ({
		name: f.string(),
		tickets: f.many(() => Ticket),
		notes: f.many(() => Note),
	}),
}).with({ access: { read: () => true } })

/** No rule, no hook: Master's update of them is one UPDATE (D-133). */
const Ticket = defineModel({
	name: 'Ticket',
	fields: (f) => ({
		title: f.string(),
		points: f.number({ integer: true }),
		board: f.one(() => Board, { optional: true }),
	}),
})

/** A user reads the notes that are not hidden; a hook rewrites `bump`. */
const Note = defineModel({
	name: 'Note',
	fields: (f) => ({
		text: f.string(),
		hidden: f.boolean({ default: false }),
		board: f.one(() => Board, { optional: true }),
	}),
}).with({
	access: {
		read: ({ where }) => where({ hidden: false }),
		create: () => true,
		update: () => true,
	},
	hooks: {
		afterCreate: async ({ record }) => {
			if (record.text !== 'bump') return
			await Note.update({ where: { id: record.id }, data: { text: 'up' } }, M)
		},
	},
})

export function bulkReturns(create: () => Adapter): void {
	describe('bulk returns', () => {
		started(create, [Board, Ticket, Note])

		it('returns the rows created, in the order of data', async () => {
			const board = await Board.create({ data: { name: 'b' } }, M)
			const connect = { connect: { id: board.id } }
			const rows = await Ticket.createManyAndReturn(
				{
					data: [
						{ title: 'z', points: 1, board: connect },
						{ title: 'a', points: 2 },
					],
					select: { title: true, board: { select: { name: true } } },
				},
				M,
			)
			expect(rows).toStrictEqual([
				{ title: 'z', board: { name: 'b' } },
				{ title: 'a', board: null },
			])
			const notes = await Note.createManyAndReturn(
				{
					data: [{ text: 'bump', hidden: true }, { text: 'n' }],
					select: { text: true, hidden: true },
				},
				user,
			)
			expect(notes).toStrictEqual([
				{ text: 'up', hidden: true },
				{ text: 'n', hidden: false },
			])
		})

		it('returns the rows of one UPDATE in id order, as it left them', async () => {
			const board = await Board.create({ data: { name: 'b' } }, M)
			const connect = { connect: { id: board.id } }
			for (const [title, points] of [
				['c', 1],
				['a', 2],
				['b', 3],
			] as const) {
				await Ticket.create({ data: { title, points, board: connect } }, M)
			}
			const where = { title: { in: ['c', 'a'] } }
			const rows = await Ticket.updateManyAndReturn(
				{
					where,
					data: { points: { multiply: 10 } },
					select: { title: true, points: true },
				},
				M,
			)
			expect(rows).toStrictEqual([
				{ title: 'c', points: 10 },
				{ title: 'a', points: 20 },
			])
			const shaped = await Ticket.updateManyAndReturn(
				{
					where,
					data: { points: { increment: 1 } },
					select: { points: true, board: { select: { _count: true } } },
				},
				M,
			)
			expect(shaped).toStrictEqual([
				{ points: 11, board: { _count: { tickets: 3, notes: 0 } } },
				{ points: 21, board: { _count: { tickets: 3, notes: 0 } } },
			])
		})

		it('returns each row its rule lets it update, read or not', async () => {
			const board = await Board.create({ data: { name: 'b' } }, M)
			const connect = { connect: { id: board.id } }
			for (const text of ['q', 'p', 'r']) {
				await Note.create({ data: { text, board: connect } }, M)
			}
			const rows = await Note.updateManyAndReturn(
				{
					where: { text: { not: 'r' } },
					data: { hidden: true },
					select: {
						text: true,
						hidden: true,
						board: { select: { name: true } },
					},
				},
				user,
			)
			expect(rows).toStrictEqual([
				{ text: 'q', hidden: true, board: { name: 'b' } },
				{ text: 'p', hidden: true, board: { name: 'b' } },
			])
			const none = { where: { text: 'q' }, data: { text: 'x' } }
			expect(await Note.updateManyAndReturn(none, user)).toEqual([])
		})
	})
}
