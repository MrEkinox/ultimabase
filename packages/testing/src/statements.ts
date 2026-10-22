// The round trips of the contract (D-46): a read, its relations at any depth
// included, is one statement, and so is a count.
import type { Adapter } from 'ultimabase'
import { defineApp, defineModel, master } from 'ultimabase'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
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
		writer: f.one(() => Writer),
		genres: f.many(() => Genre),
	}),
})

const Genre = defineModel({
	name: 'Genre',
	fields: (f) => ({ label: f.string(), novels: f.many(() => Novel) }),
})

export function statements(create: () => Adapter, counted: () => number): void {
	const started = () =>
		defineApp({
			database: create(),
			models: [Writer, Novel, Genre],
			logger: silent,
		})
	const once = async <T>(read: () => Promise<T>): Promise<T> => {
		const before = counted()
		const result = await read()
		expect(counted() - before).toBe(1)
		return result
	}

	describe('statements', () => {
		let app: ReturnType<typeof started>
		beforeEach(async () => {
			app = started()
			await app.start()
			const genre = await Genre.create({ data: { label: 'tale' } }, M)
			const writer = await Writer.create({ data: { name: 'Ada' } }, M)
			await Novel.create(
				{
					data: {
						title: 'Engines',
						writer: { connect: { id: writer.id } },
						genres: { connect: [{ id: genre.id }] },
					},
				},
				M,
			)
		})
		afterEach(async () => app.stop())

		it('reads three levels of relations in one statement', async () => {
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

		it('counts in one statement', async () => {
			expect(await once(async () => Novel.count({}, M))).toBe(1)
		})
	})
}
