// `one` views in the contract (D-240): the one row of a one-to-many `many`
// that its filter keeps, held single by a partial unique index, read by
// include, a nested select and `is`, `isNot` and `is: null`.
import type { Adapter, Identity } from 'ultimabase'
import { allow, defineModel, master } from 'ultimabase'
import { beforeEach, describe, expect, it } from 'vitest'
import { started } from './suite.ts'

const M: { readonly as: Identity } = { as: master }

const Board = defineModel({
	name: 'Board',
	fields: (f) => ({
		name: f.string({ unique: true }),
		rounds: f.many(() => Round, { inverse: 'board' }),
		current: f.one(() => Round, { from: 'rounds' }),
	}),
}).with({
	access: allow.public,
	relations: { current: { where: ({ where }) => where({ closedAt: null }) } },
})

const Round = defineModel({
	name: 'Round',
	fields: (f) => ({
		name: f.string(),
		hidden: f.boolean({ default: false }),
		closedAt: f.dateTime({ optional: true }),
		board: f.one(() => Board),
	}),
	indexes: [{ fields: ['board'], unique: true, where: { closedAt: null } }],
}).with({ access: { read: ({ where }) => where({ hidden: false }) } })

const names = async (where: object): Promise<unknown> =>
	Board.findMany({ where, orderBy: { name: 'asc' }, select: { name: true } }, M)
const named = (...list: readonly string[]) => list.map((name) => ({ name }))
const closed = new Date('2026-01-01T00:00:00.000Z')

export function oneViews(create: () => Adapter): void {
	describe('one views', () => {
		started(create, [Board, Round])

		beforeEach(async () => {
			const rounds = {
				Ada: [{ name: 'First', closedAt: closed }, { name: 'Second' }],
				Bob: [{ name: 'Old', closedAt: closed }],
				Cy: [{ name: 'Secret', hidden: true }],
			}
			for (const [name, list] of Object.entries(rounds)) {
				await Board.create({ data: { name, rounds: { create: list } } }, M)
			}
		})

		it('reads the row its filter keeps, or null', async () => {
			const rows = await Board.findMany(
				{
					orderBy: { name: 'asc' },
					select: { name: true, current: { select: { name: true } } },
				},
				M,
			)
			expect(rows).toEqual([
				{ name: 'Ada', current: { name: 'Second' } },
				{ name: 'Bob', current: null },
				{ name: 'Cy', current: { name: 'Secret' } },
			])
		})

		it('reads null where the target read rule hides the row', async () => {
			const rows = await Board.findMany(
				{ orderBy: { name: 'asc' }, include: { current: true } },
				{ as: { kind: 'anonymous' } },
			)
			expect(rows.map((row) => row.current?.name ?? null)).toEqual([
				'Second',
				null,
				null,
			])
		})

		it('filters is, isNot and is null', async () => {
			expect(await names({ current: { is: { name: 'Second' } } })).toEqual(
				named('Ada'),
			)
			expect(await names({ current: { is: { name: 'First' } } })).toEqual([])
			expect(await names({ current: { is: null } })).toEqual(named('Bob'))
			expect(await names({ current: { isNot: { name: 'Second' } } })).toEqual(
				named('Bob', 'Cy'),
			)
			expect(await names({ current: { isNot: null } })).toEqual(
				named('Ada', 'Cy'),
			)
		})

		it('keeps its target to one open row', async () => {
			const ada = await Board.findUniqueOrThrow({ where: { name: 'Ada' } }, M)
			await expect(
				Round.create(
					{ data: { name: 'Third', board: { connect: { id: ada.id } } } },
					M,
				),
			).rejects.toMatchObject({ code: 'UNIQUE_VIOLATION' })
		})
	})
}
