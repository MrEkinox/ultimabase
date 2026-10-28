// The round trips of the contract, BEGIN and COMMIT included (D-46, D-48,
// D-99): a read, its relations at any depth, counts and sorts through
// relations included (D-134), is one, and so are a count and a write that
// needs no stored row. A write that decides from its row locks it (D-104).
import type { Adapter } from 'ultimabase'
import { defineModel, master, transaction } from 'ultimabase'
import { beforeEach, describe, expect, it } from 'vitest'
import { suiteUser } from './as-user.ts'
import { started } from './suite.ts'

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

/** A novel's data for `createMany`, by its writer. */
const byWriter = (id: string) => ({ title: 'A', writer: { connect: { id } } })

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

const me = '00000000-0000-4000-8000-000000000000'

let hooks = 0
const Cabinet = defineModel({
	name: 'Cabinet',
	fields: (f) => ({ label: f.string(), drawers: f.many(() => Drawer) }),
}).with({ access: { read: open, update: open, delete: open } })

/** A model with an update hook, which a relation write reaches. */
const Drawer = defineModel({
	name: 'Drawer',
	fields: (f) => ({
		label: f.string(),
		cabinet: f.one(() => Cabinet, { optional: true }),
	}),
}).with({
	access: { read: open, update: open },
	hooks: {
		beforeUpdate: async () => {
			hooks += 1
		},
	},
})

/** Models with hooks after their writes, which run in a transaction. */
const Note = defineModel({
	name: 'Note',
	fields: (f) => ({ text: f.string() }),
}).with({ hooks: { afterCreate: async () => {} } })

const Memo = defineModel({
	name: 'Memo',
	fields: (f) => ({ text: f.string() }),
}).with({ hooks: { afterCreateCommit: async () => {} } })

const user = suiteUser(me)

export function roundTrips(create: () => Adapter, counted: () => number): void {
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
		started(create, [Writer, Novel, Genre, Shelf, Cabinet, Drawer, Note, Memo])

		let writer = ''
		let genre = ''
		let engines = ''
		beforeEach(async () => {
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

		it('reads counts and sorts through relations in one', async () => {
			const novels = await once(async () =>
				Novel.findMany(
					{
						orderBy: [
							{ writer: { name: 'asc' } },
							{ genres: { _count: 'desc' } },
						],
						include: {
							_count: true,
							writer: { include: { _count: { select: { novels: true } } } },
						},
					},
					M,
				),
			)
			expect(novels).toMatchObject([
				{ _count: { genres: 1 }, writer: { _count: { novels: 1 } } },
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

		// A nested create is planned with its parent (D-128).
		it('creates nested rows in one, at any depth', async () => {
			const created = await once(async () =>
				Writer.create(
					{
						data: {
							name: 'Bo',
							novels: {
								create: [
									{
										title: 'Waves',
										genres: {
											connect: [{ id: genre }],
											create: [{ label: 'sea' }],
										},
									},
								],
							},
						},
						include: { novels: { include: { genres: true } } },
					},
					M,
				),
			)
			expect(created).toMatchObject({
				novels: [{ title: 'Waves', genres: [{ id: genre }, { label: 'sea' }] }],
			})
		})

		it('writes nothing when a connection is missing', async () => {
			const created = once(async () =>
				Novel.create(
					{
						data: {
							title: 'Lost',
							writer: { connect: { id: writer } },
							genres: { connect: [{ id: genre }, { id: me }] },
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
				Writer.update({ where: { id: me }, data: { name: 'Nobody' } }, M),
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
							genres: {
								disconnect: [{ id: genre }],
								connect: [{ id: other }],
							},
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

		// D-135: the relations a delete returns cost one read before it.
		it('reads the relations a delete returns once, before it', async () => {
			const where = { id: writer }
			const removed = await trips(4, async () =>
				Writer.delete({ where, include: { novels: true } }, M),
			)
			expect(removed.novels).toMatchObject([{ title: 'Engines' }])
			const { id } = await Cabinet.create({ data: { label: 'a' } }, M)
			const drawers = { where: { id }, include: { drawers: true } } as const
			// BEGIN, the row locked, read, its drawers loaded, the write, COMMIT.
			await trips(6, async () => Cabinet.delete(drawers, { as: user }))
		})

		it('deletes many in one as Master; a user locks the rows first', async () => {
			const removed = once(async () => Writer.deleteMany({}, M))
			await expect(removed).resolves.toEqual({ count: 1 })
			await Shelf.create({ data: { label: 'top' } }, M)
			// BEGIN, the locked rows, the write, COMMIT (D-111).
			const locked = trips(4, async () => Shelf.deleteMany({}, { as: user }))
			await expect(locked).resolves.toEqual({ count: 1 })
		})

		// D-135
		it('creates many in one, its connections checked', async () => {
			const two = { data: [byWriter(writer), byWriter(writer)] }
			const many = once(async () => Novel.createMany(two, M))
			await expect(many).resolves.toEqual({ count: 2 })
			const labels = { data: [{ label: 'a' }, { label: 'b' }] }
			const shelves = once(async () => Shelf.createMany(labels, { as: user }))
			await expect(shelves).resolves.toEqual({ count: 2 })
			// BEGIN, the write, a read for each row's hook, COMMIT.
			const texts = { data: [{ text: 'a' }, { text: 'b' }] }
			const notes = trips(5, async () => Note.createMany(texts, M))
			await expect(notes).resolves.toEqual({ count: 2 })
			const missing = { data: [byWriter(writer), byWriter(me)] }
			const refused = once(async () => Novel.createMany(missing, M))
			await expect(refused).rejects.toMatchObject({ code: 'NOT_FOUND' })
			expect(await Novel.count({}, M)).toBe(3)
		})

		it('updates many in one as Master; a user locks the rows first', async () => {
			const renamed = once(async () =>
				Writer.updateMany({ data: { name: 'Bo' } }, M),
			)
			await expect(renamed).resolves.toEqual({ count: 1 })
			await Cabinet.create({ data: { label: 'a' } }, M)
			await Cabinet.create({ data: { label: 'b' } }, M)
			// BEGIN, the locked rows, one write for both, COMMIT (D-133).
			const locked = trips(4, async () =>
				Cabinet.updateMany({ data: { label: 'c' } }, { as: user }),
			)
			await expect(locked).resolves.toEqual({ count: 2 })
		})

		it('locks the row a user updates or deletes', async () => {
			const shelf = await once(async () =>
				Shelf.create({ data: { label: 'top' } }, { as: user }),
			)
			// BEGIN, the locked row, the write, COMMIT (D-104).
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

		it('locks the row before a relation write reaches update hooks', async () => {
			const cabinet = await Cabinet.create({ data: { label: 'a' } }, M)
			const drawer = await Drawer.create({ data: { label: 'd' } }, M)
			hooks = 0
			const updated = await Cabinet.update(
				{
					where: { id: cabinet.id },
					data: { drawers: { connect: [{ id: drawer.id }] } },
					include: { drawers: true },
				},
				{ as: user },
			)
			expect(updated.drawers).toMatchObject([{ id: drawer.id }])
			expect(hooks).toBe(1)
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
