// Case-insensitive unique keys in the contract (D-170): a field's and an
// index's, refused regardless of case, matched exactly by `findUnique` and
// found by an insensitive equality.
import type { Adapter } from 'ultimabase'
import { defineModel, master } from 'ultimabase'
import { describe, expect, it } from 'vitest'
import { started } from './suite.ts'

const M = { as: master }
const club = (id: string) => ({ connect: { id } })

const Account = defineModel({
	name: 'Account',
	fields: (f) => ({
		username: f.string({ unique: 'insensitive' }),
		nickname: f.string({ unique: 'insensitive', optional: true }),
	}),
})

const Club = defineModel({
	name: 'Club',
	fields: (f) => ({ name: f.string(), members: f.many(() => Member) }),
})

const Member = defineModel({
	name: 'Member',
	fields: (f) => ({ handle: f.string(), club: f.one(() => Club) }),
	indexes: [{ fields: ['handle', 'club'], unique: true, mode: 'insensitive' }],
})

export function uniqueCases(create: () => Adapter): void {
	describe('case-insensitive unique keys', () => {
		started(create, [Account, Club, Member])

		it('refuses a value another row holds in another case', async () => {
			const alice = await Account.create({ data: { username: 'alice' } }, M)
			const refused = {
				code: 'UNIQUE_VIOLATION',
				details: { model: 'Account', fields: ['username'] },
			}
			await expect(
				Account.create({ data: { username: 'Alice' } }, M),
			).rejects.toMatchObject(refused)
			await expect(
				Account.createMany(
					{ data: [{ username: 'Bob' }, { username: 'BOB' }] },
					M,
				),
			).rejects.toMatchObject(refused)
			const bob = await Account.create({ data: { username: 'bob' } }, M)
			await expect(
				Account.update(
					{ where: { id: bob.id }, data: { username: 'ALICE' } },
					M,
				),
			).rejects.toMatchObject(refused)
			const renamed = await Account.update(
				{ where: { id: alice.id }, data: { username: 'Alice' } },
				M,
			)
			expect(renamed.username).toBe('Alice')
			expect(await Account.count({}, M)).toBe(2)
		})

		it('lets rows without a value share none', async () => {
			await Account.create({ data: { username: 'ada' } }, M)
			await Account.create({ data: { username: 'grace' } }, M)
			await Account.create(
				{ data: { username: 'linus', nickname: 'Penguin' } },
				M,
			)
			await expect(
				Account.create({ data: { username: 'tux', nickname: 'penguin' } }, M),
			).rejects.toMatchObject({
				details: { model: 'Account', fields: ['nickname'] },
			})
		})

		it('matches exactly by key, and finds the other cases with mode', async () => {
			const alice = await Account.create({ data: { username: 'Alice' } }, M)
			expect(
				await Account.findUnique({ where: { username: 'alice' } }, M),
			).toBeNull()
			expect(
				await Account.findUnique({ where: { username: 'Alice' } }, M),
			).toEqual(alice)
			const insensitive = { equals: 'ALICE', mode: 'insensitive' } as const
			expect(
				await Account.findFirst({ where: { username: insensitive } }, M),
			).toEqual(alice)
			expect(
				await Account.count(
					{ where: { username: { not: 'aLiCe', mode: 'insensitive' } } },
					M,
				),
			).toBe(0)
			expect(
				await Account.count(
					{ where: { username: { in: ['ALICE'], mode: 'insensitive' } } },
					M,
				),
			).toBe(1)
		})

		it('refuses the values of an index in another case, its other fields alike', async () => {
			const chess = await Club.create({ data: { name: 'Chess' } }, M)
			const go = await Club.create({ data: { name: 'Go' } }, M)
			await Member.create({ data: { handle: 'ada', club: club(chess.id) } }, M)
			await expect(
				Member.create({ data: { handle: 'ADA', club: club(chess.id) } }, M),
			).rejects.toMatchObject({
				code: 'UNIQUE_VIOLATION',
				details: { model: 'Member', fields: ['handle', 'club'] },
			})
			await Member.create({ data: { handle: 'ADA', club: club(go.id) } }, M)
			expect(await Member.count({}, M)).toBe(2)
		})
	})
}
