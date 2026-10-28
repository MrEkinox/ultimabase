// A read's `fields` (D-136): the rows hold `id` and those fields only, in a
// relation too; without them, the whole row and each `one` key.
import type { Adapter } from 'ultimabase'
import { defineModel, master } from 'ultimabase'
import { beforeEach, describe, expect, it } from 'vitest'
import { started } from './suite.ts'

const M = { as: master }

const Writer = defineModel({
	name: 'Writer',
	fields: (f) => ({ name: f.string(), notes: f.many(() => Note) }),
})

const Note = defineModel({
	name: 'Note',
	fields: (f) => ({
		title: f.string(),
		body: f.string(),
		writer: f.one(() => Writer),
	}),
})

export function projection(create: () => Adapter): void {
	describe('projection', () => {
		const database = started(create, [Writer, Note])

		let ada: string
		beforeEach(async () => {
			ada = (await Writer.create({ data: { name: 'Ada' } }, M)).id
			await Note.create(
				{
					data: {
						title: 'one',
						body: 'long',
						writer: { connect: { id: ada } },
					},
				},
				M,
			)
		})

		it('reads the fields a read names, in a relation too', async () => {
			const [note] = await database().find({
				model: 'Note',
				fields: ['title'],
				include: { writer: { fields: ['name'] } },
			})
			expect(note).toEqual({
				id: note?.id,
				title: 'one',
				writer: { id: ada, name: 'Ada' },
			})
			const [whole] = await database().find({ model: 'Note' })
			expect(Object.keys(whole ?? {}).toSorted()).toEqual([
				'body',
				'createdAt',
				'id',
				'title',
				'updatedAt',
				'writer',
			])
		})
	})
}
