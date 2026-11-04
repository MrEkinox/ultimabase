// Partial unique indexes in the contract (D-215): the rows an index's `where`
// keeps share no values; the rows outside it are never in conflict.
import type { Adapter } from 'ultimabase'
import { defineModel, master } from 'ultimabase'
import { describe, expect, it } from 'vitest'
import { started } from './suite.ts'

const M = { as: master }
const person = (id: string) => ({ connect: { id } })

const Person = defineModel({
	name: 'Person',
	fields: (f) => ({
		name: f.string(),
		attendances: f.many(() => Attendance, { inverse: 'person' }),
	}),
})

const Attendance = defineModel({
	name: 'Attendance',
	fields: (f) => ({
		person: f.one(() => Person),
		leftAt: f.dateTime({ optional: true }),
	}),
	indexes: [{ fields: ['person'], unique: true, where: { leftAt: null } }],
})

const Ticket = defineModel({
	name: 'Ticket',
	fields: (f) => ({
		code: f.string(),
		status: f.string(),
		active: f.boolean(),
	}),
	indexes: [
		{
			fields: ['code'],
			unique: true,
			mode: 'insensitive',
			where: { status: { not: 'archived' }, active: true },
		},
	],
})

const open = {
	code: 'UNIQUE_VIOLATION',
	details: { model: 'Attendance', fields: ['person'] },
}

export function partialUniqueCases(create: () => Adapter): void {
	describe('partial unique indexes', () => {
		started(create, [Person, Attendance, Ticket])

		it('refuses a second row the where keeps, and lets the others share it', async () => {
			const ada = await Person.create({ data: { name: 'Ada' } }, M)
			const first = await Attendance.create(
				{ data: { person: person(ada.id) } },
				M,
			)
			await expect(
				Attendance.create({ data: { person: person(ada.id) } }, M),
			).rejects.toMatchObject(open)
			await Attendance.update(
				{ where: { id: first.id }, data: { leftAt: new Date() } },
				M,
			)
			const left = { person: person(ada.id), leftAt: new Date() }
			await Attendance.createMany({ data: [left, left] }, M)
			await Attendance.create({ data: { person: person(ada.id) } }, M)
			expect(await Attendance.count({}, M)).toBe(4)
		})

		it('refuses a row an update or createMany brings into the where', async () => {
			const ada = await Person.create({ data: { name: 'Ada' } }, M)
			await Attendance.create({ data: { person: person(ada.id) } }, M)
			const closed = await Attendance.create(
				{ data: { person: person(ada.id), leftAt: new Date() } },
				M,
			)
			await expect(
				Attendance.update(
					{ where: { id: closed.id }, data: { leftAt: null } },
					M,
				),
			).rejects.toMatchObject(open)
			const grace = await Person.create({ data: { name: 'Grace' } }, M)
			const again = { person: person(grace.id) }
			await expect(
				Attendance.createMany({ data: [again, again] }, M),
			).rejects.toMatchObject(open)
			expect(await Attendance.count({}, M)).toBe(2)
		})

		it('keeps the rows every condition of the where holds for, regardless of case', async () => {
			const data = { code: 'abc', status: 'open', active: true }
			await Ticket.create({ data }, M)
			await expect(
				Ticket.create({ data: { ...data, code: 'ABC' } }, M),
			).rejects.toMatchObject({
				code: 'UNIQUE_VIOLATION',
				details: { model: 'Ticket', fields: ['code'] },
			})
			await Ticket.create({ data: { ...data, status: 'archived' } }, M)
			await Ticket.create({ data: { ...data, active: false } }, M)
			await Ticket.create({ data: { ...data, code: 'abd' } }, M)
			expect(await Ticket.count({}, M)).toBe(4)
		})
	})
}
