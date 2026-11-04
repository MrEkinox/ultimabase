// An `exists` in the contract (D-246): whether its view keeps a row, read
// through take 1 and filtered with `some` and `none`, under the target's
// read rule.
import type { Adapter, Identity } from 'ultimabase'
import { allow, defineModel, master } from 'ultimabase'
import { beforeEach, describe, expect, it } from 'vitest'
import { started } from './suite.ts'

const M: { readonly as: Identity } = { as: master }

const Shelf = defineModel({
	name: 'Shelf',
	fields: (f) => ({
		name: f.string({ unique: true }),
		books: f.many(() => Book, { inverse: 'shelf' }),
		hasLent: f.exists(() => Book, { from: 'books' }),
	}),
}).with({
	access: allow.public,
	relations: { hasLent: { where: ({ where }) => where({ lent: true }) } },
})

const Book = defineModel({
	name: 'Book',
	fields: (f) => ({
		lent: f.boolean({ default: false }),
		hidden: f.boolean({ default: false }),
		shelf: f.one(() => Shelf),
	}),
}).with({ access: { read: ({ where }) => where({ hidden: false }) } })

export function exists(create: () => Adapter): void {
	describe('exists', () => {
		started(create, [Shelf, Book])

		beforeEach(async () => {
			const books = {
				Ada: [{ lent: true }, { lent: true }, {}],
				Bob: [{}],
				Cy: [{ lent: true, hidden: true }],
			}
			for (const [name, list] of Object.entries(books)) {
				await Shelf.create({ data: { name, books: { create: list } } }, M)
			}
		})

		const read = async (where: object, as: Identity = master) =>
			Shelf.findMany(
				{
					where,
					orderBy: { name: 'asc' },
					select: { name: true, hasLent: true },
				},
				{ as },
			)
		const names = async (hasLent: boolean, as?: Identity) =>
			(await read({ hasLent }, as)).map((row) => row.name)

		it('reads whether its view keeps a row', async () => {
			expect(await read({})).toEqual([
				{ name: 'Ada', hasLent: true },
				{ name: 'Bob', hasLent: false },
				{ name: 'Cy', hasLent: true },
			])
			// The target's read rule hides Cy's book (D-86).
			const anonymous = await read({}, { kind: 'anonymous' })
			expect(anonymous.map((row) => row.hasLent)).toEqual([true, false, false])
		})

		it('filters on a boolean', async () => {
			expect(await names(true)).toEqual(['Ada', 'Cy'])
			expect(await names(false)).toEqual(['Bob'])
			expect(await names(true, { kind: 'anonymous' })).toEqual(['Ada'])
		})
	})
}
