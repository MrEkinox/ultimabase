// The round trips of the contract, BEGIN and COMMIT included (D-46, D-48,
// D-99): a read, its relations at any depth included, is one, and so are a
// count and a write that needs no stored row.
import type { Adapter } from 'ultimabase'
import { defineApp, defineModel, master, transaction } from 'ultimabase'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { asUser } from './as-user.ts'
import { silent } from './silent.ts'

const M = { as: master }

const Writer = defineModel({
	name: 'Writer',
	fields: (f) => ({ name: f.string(), novels: f.many(() => Novel) }),
})

const Novel = defineModel({
	name: 'Novel',
	fields: (f) => ({
		title: f.string(),
		writer: f.one(() => Writer, { onDelete: 'cascade' }),
		genres: f.many(() => Genre),
	}),
})

const Genre = defineModel({
	name: 'Genre',
	fields: (f) => ({ label: f.string(), novels: f.many(() => Novel) }),
})

const open = () => true
/** A model with rules: a user's update loads the row they decide from. */
const Shelf = defineModel({
	name: 'Shelf',
	fields: (f) => ({ label: f.string({ unique: true }) }),
}).with({ access: { read: open, create: open, update: open, delete: open } })

/** Models with hooks after their writes, which run in a transaction. */
const Note = defineModel({
	name: 'Note',
	fields: (f) => ({ text: f.string() }),
}).with({ hooks: { afterCreate: async () => {} } })

const Memo = defineModel({
	name: 'Memo',
	fields: (f) => ({ text: f.string() }),
}).with({ hooks: { afterCreateCommit: async () => {} } })

const user = asUser({ id: '00000000-0000-4000-8000-000000000000' })

export function roundTrips(create: () => Adapter, counted: () => number): void {
	const started = () =>
		defineApp({
			database: create(),
			models: [Writer, Novel, Genre, Shelf, Note, Memo],
			logger: silent,
		})
	const trips = async <T>(
		expected: number,
		run: () => Promise<T>,
	): Promise<T> => {
		const before = counted()
		const result = await run()
		expect(counted() - before).toBe(expected)
		return result
	}
	const once = async <T>(run: () => Promise<T>): Promise<T> => trips(1, run)

	describe('round trips', () => {
		let app: ReturnType<typeof started>
		let writer = ''
		let genre = ''
		let engines = ''
		beforeEach(async () => {
			app = started()
			await app.start()
			genre = (await Genre.create({ data: { label: 'tale' } }, M)).id
			writer = (await Writer.create({ data: { name: 'Ada' } }, M)).id
			const created = await Novel.create(
				{
					data: {
						title: 'Engines',
						writer: { connect: { id: writer } },
						genres: { connect: [{ id: genre }] },
					},
				},
				M,
			)
			engines = created.id
		})
		afterEach(async () => app.stop())

		it('reads three levels of relations in one', async () => {
			const writers = await once(async () =>
				Writer.findMany(
					{
						include: {
							novels: { include: { genres: { include: { novels: true } } } },
						},
					},
					M,
				),
			)
			expect(writers).toMatchObject([
				{
					novels: [
						{ genres: [{ label: 'tale', novels: [{ title: 'Engines' }] }] },
					],
				},
			])
		})

		it('counts in one', async () => {
			expect(await once(async () => Novel.count({}, M))).toBe(1)
		})

		it('creates in one, its connections checked', async () => {
			const novel = await once(async () =>
				Novel.create(
					{
						data: {
							title: 'Notes',
							writer: { connect: { id: writer } },
							genres: { connect: [{ id: genre }] },
						},
						include: { writer: true, genres: true },
					},
					M,
				),
			)
			expect(novel).toMatchObject({
				title: 'Notes',
				writer: { id: writer },
				genres: [{ id: genre }],
			})
		})

		it('writes nothing when a connection is missing', async () => {
			const missing = '00000000-0000-4000-8000-000000000001'
			const created = once(async () =>
				Novel.create(
					{
						data: {
							title: 'Lost',
							writer: { connect: { id: writer } },
							genres: { connect: [{ id: genre }, { id: missing }] },
						},
					},
					M,
				),
			)
			await expect(created).rejects.toMatchObject({ code: 'NOT_FOUND' })
			expect(await Novel.count({}, M)).toBe(1)
		})

		it('updates by id in one as Master, the row checked', async () => {
			const updated = await once(async () =>
				Writer.update({ where: { id: writer }, data: { name: 'Lovelace' } }, M),
			)
			expect(updated.name).toBe('Lovelace')
			const missing = once(async () =>
				Writer.update(
					{
						where: { id: '00000000-0000-4000-8000-000000000001' },
						data: { name: 'Nobody' },
					},
					M,
				),
			)
			await expect(missing).rejects.toMatchObject({ code: 'NOT_FOUND' })
		})

		it('moves a many in one, disconnected and connected', async () => {
			const other = (await Genre.create({ data: { label: 'saga' } }, M)).id
			const moved = await once(async () =>
				Novel.update(
					{
						where: { id: engines },
						data: {
							genres: { disconnect: [{ id: genre }], connect: [{ id: other }] },
						},
						include: { genres: true },
					},
					M,
				),
			)
			expect(moved.genres).toMatchObject([{ id: other }])
			// The same genre on both sides: disconnected, then connected again.
			const kept = await Novel.update(
				{
					where: { id: engines },
					data: {
						genres: { disconnect: [{ id: other }], connect: [{ id: other }] },
					},
					include: { genres: true },
				},
				M,
			)
			expect(kept.genres).toMatchObject([{ id: other }])
		})

		it('deletes in one as Master, what it reaches included', async () => {
			// The writer, its novel and the novel's genres, the writer returned.
			const removed = await once(async () =>
				Writer.delete({ where: { id: writer } }, M),
			)
			expect(removed.name).toBe('Ada')
			expect(await Novel.count({}, M)).toBe(0)
			const missing = once(async () =>
				Writer.delete({ where: { id: writer } }, M),
			)
			await expect(missing).rejects.toMatchObject({ code: 'NOT_FOUND' })
		})

		it('loads the row a user updates or deletes, in a transaction', async () => {
			const shelf = await once(async () =>
				Shelf.create({ data: { label: 'top' } }, { as: user }),
			)
			// BEGIN, the locked row, the write, COMMIT.
			await trips(4, async () =>
				Shelf.update(
					{ where: { id: shelf.id }, data: { label: 'high' } },
					{ as: user },
				),
			)
			await trips(4, async () =>
				Shelf.delete({ where: { id: shelf.id } }, { as: user }),
			)
			expect(await Shelf.count({}, M)).toBe(0)
		})

		it('runs a write with an after hook in a transaction', async () => {
			// BEGIN, the write, the row the hook gets, the row read again, since
			// the hook may change it, COMMIT.
			const note = await trips(5, async () =>
				Note.create({ data: { text: 'hi' } }, M),
			)
			// BEGIN, the write and its row, the row the hook gets, COMMIT.
			const memo = await trips(4, async () =>
				Memo.create({ data: { text: 'hi' } }, M),
			)
			expect([note.text, memo.text]).toEqual(['hi', 'hi'])
		})

		it('runs every write of transaction() in one', async () => {
			// BEGIN, two writes, COMMIT.
			await trips(4, async () =>
				transaction(async () => {
					await Genre.create({ data: { label: 'myth' } }, M)
					await Genre.create({ data: { label: 'saga' } }, M)
				}),
			)
			expect(await Genre.count({}, M)).toBe(3)
		})
	})
}
