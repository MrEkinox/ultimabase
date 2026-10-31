// Transfers between Ada's and Grace's accounts, each test on a new
// in-memory database: Ada holds 100, Grace 0.
import { asUser, testApplication } from '@ultimabase/testing'
import { master, transaction } from 'ultimabase'
import { beforeEach, expect, it } from 'vitest'
import { app } from './app.ts'
import { like, transfer } from './functions.ts'
import { Account, Like } from './models.ts'

testApplication(app)

const as = { as: master }
const ada = { as: asUser({ id: 'ada' }) }
let from = ''
let to = ''

beforeEach(async () => {
	const data = { number: 'A-1', ownerId: 'ada', balance: 100 }
	from = (await Account.create({ data }, as)).id
	to = (await Account.create({ data: { number: 'G-1', ownerId: 'grace' } }, as))
		.id
})

/** Ada's and Grace's balances. */
async function balances(): Promise<number[]> {
	const accounts = await Account.findMany({ orderBy: { number: 'asc' } }, as)
	return accounts.map((account) => account.balance)
}

it('commits every write', async () => {
	//#region commit
	await transfer.run({ from, to, amount: 30 }, ada)
	expect(await balances()).toEqual([70, 30])
	//#endregion
})

it('rolls every write back when the callback throws', async () => {
	//#region rollback
	await expect(
		transfer.run({ from, to, amount: 130 }, ada),
	).rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS' })
	// The decrement was undone.
	expect(await balances()).toEqual([100, 0])
	//#endregion
})

it('joins the transaction it runs in', async () => {
	//#region nested
	// The second transfer fails: the first is undone with it.
	await expect(
		transaction(async () => {
			await transfer.run({ from, to, amount: 60 }, ada)
			await transfer.run({ from, to, amount: 60 }, ada)
		}),
	).rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS' })
	expect(await balances()).toEqual([100, 0])
	//#endregion
})

it('rolls back after a failed query, even caught', async () => {
	//#region failed
	const duplicate = { data: { number: 'A-1', ownerId: 'ada' } }
	await expect(
		transaction(async () => {
			await Account.update({ where: { id: from }, data: { balance: 0 } }, as)
			await Account.create(duplicate, as).catch(() => undefined)
		}),
	).rejects.toMatchObject({ code: 'UNIQUE_VIOLATION' })
	expect(await balances()).toEqual([100, 0])
	//#endregion
})

it('matches two users liking each other at once', async () => {
	//#region match
	const grace = { as: asUser({ id: 'grace' }) }
	const results = await Promise.all([
		like.run({ user: 'grace' }, ada),
		like.run({ user: 'ada' }, grace),
	])
	// Whichever runs second sees the first like.
	expect(results.filter((result) => result.matched)).toHaveLength(1)
	const matched = await Like.count({ where: { matchedAt: { not: null } } }, as)
	expect(matched).toBe(2)
	//#endregion
})
