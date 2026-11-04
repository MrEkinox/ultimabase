// A `one` relation that no relation names (D-237): it stores the key, the
// target gets no field, and its writes, reads and deletes work as a stored
// `one`'s do.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defineApp, defineModel, master, memory } from './index.ts'
import { resolve } from './schema.ts'

const M = { as: master }

const Person = defineModel({
	name: 'Person',
	fields: (f) => ({
		name: f.string(),
		notes: f.many(() => Note, { inverse: 'author' }),
	}),
})

const Note = defineModel({
	name: 'Note',
	fields: (f) => ({
		text: f.string(),
		// Named by `Person.notes`; the two below are named by none.
		author: f.one(() => Person),
		editor: f.one(() => Person, { optional: true }),
		owner: f.one(() => Person, { onDelete: 'cascade' }),
	}),
})

const started = () => defineApp({ database: memory(), models: [Person, Note] })

/** A note of Bob's, owned by Ann and edited by Eve, whom it creates. */
const note = async () => {
	const ann = await Person.create({ data: { name: 'Ann' } }, M)
	const bob = await Person.create({ data: { name: 'Bob' } }, M)
	const made = await Note.create(
		{
			data: {
				text: 'hello',
				author: { connect: { id: bob.id } },
				owner: { connect: { id: ann.id } },
				// The whole input of the target, its `notes` included.
				editor: { create: { name: 'Eve', notes: { connect: [] } } },
			},
			include: { editor: true },
		},
		M,
	)
	return { ann, bob, made }
}

describe('a one relation that no relation names (D-237)', () => {
	it('stores the key, and its target gets no field', () => {
		const { models } = resolve([Person, Note])
		expect(models.get('Note')?.fields.get('editor')).toMatchObject({
			kind: 'one',
			stored: true,
			unique: false,
			optional: true,
			onDelete: 'setNull',
		})
		expect(models.get('Note')?.fields.get('editor')).not.toHaveProperty(
			'inverse',
		)
		expect(models.get('Note')?.fields.get('author')).toMatchObject({
			inverse: 'notes',
		})
		expect([...(models.get('Person')?.fields.keys() ?? [])]).toEqual([
			'name',
			'notes',
		])
	})

	it('refuses a within whose target has no other side', () => {
		const Org = defineModel({
			name: 'Org',
			fields: (f) => ({ tickets: f.many(() => Ticket, { inverse: 'org' }) }),
		})
		const Member = defineModel({
			name: 'Member',
			fields: (f) => ({ org: f.one(() => Org) }),
		})
		const Ticket = defineModel({
			name: 'Ticket',
			fields: (f) => ({
				org: f.one(() => Org),
				assignee: f.one(() => Member, { within: 'org' }),
			}),
		})
		expect(() => resolve([Org, Member, Ticket])).toThrow(
			'Ticket.assignee: within names Member.org, which needs its other side.',
		)
	})

	describe('on memory()', () => {
		let app: ReturnType<typeof started>
		beforeEach(async () => {
			app = started()
			await app.start()
		})
		afterEach(async () => app.stop())

		it('creates, reads and filters through it', async () => {
			const { made } = await note()
			expect(made.editor).toMatchObject({ name: 'Eve' })
			const found = await Note.findMany(
				{ where: { editor: { is: { name: 'Eve' } } } },
				M,
			)
			expect(found.map(({ id }) => id)).toEqual([made.id])
		})

		it('keeps it in the rows a nested create makes from its target', async () => {
			const { ann } = await note()
			// `Person.notes` names `author` alone: `owner` stays in the data.
			const cid = await Person.create(
				{
					data: {
						name: 'Cid',
						notes: {
							create: [{ text: 'mine', owner: { connect: { id: ann.id } } }],
						},
					},
					include: { notes: { include: { owner: true } } },
				},
				M,
			)
			expect(cid.notes).toMatchObject([
				{ text: 'mine', owner: { name: 'Ann' } },
			])
		})

		it('updates and deletes the row it links, nested', async () => {
			const { made } = await note()
			await Note.update(
				{
					where: { id: made.id },
					data: { editor: { update: { name: 'Eva' } } },
				},
				M,
			)
			expect(await Person.findMany({ where: { name: 'Eva' } }, M)).toHaveLength(
				1,
			)
			const updated = await Note.update(
				{
					where: { id: made.id },
					data: { editor: { delete: true } },
					include: { editor: true },
				},
				M,
			)
			expect(updated.editor).toBeNull()
			expect(await Person.findMany({ where: { name: 'Eva' } }, M)).toEqual([])
			await expect(
				Note.update(
					{
						where: { id: made.id },
						data: { editor: { update: { name: 'Zoe' } } },
					},
					M,
				),
			).rejects.toMatchObject({ code: 'NOT_FOUND' })
		})

		it('applies onDelete when its target is deleted', async () => {
			const { ann, made } = await note()
			const eve = await Person.findMany({ where: { name: 'Eve' } }, M)
			await Person.delete({ where: { id: String(eve[0]?.id) } }, M)
			const kept = await Note.findUnique(
				{ where: { id: made.id }, include: { editor: true } },
				M,
			)
			expect(kept?.editor).toBeNull()
			await Person.delete({ where: { id: ann.id } }, M)
			expect(await Note.findMany({}, M)).toEqual([])
		})
	})
})
