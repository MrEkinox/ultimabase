// The transactions of the contract (D-73): one commit for every write, one
// rollback for all of them, and nothing seen outside before the commit.
import { setTimeout } from 'node:timers/promises'
import type { Adapter } from 'ultimabase'
import { defineModel, master, transaction } from 'ultimabase'
import { describe, expect, it } from 'vitest'
import { started } from './suite.ts'

const M = { as: master }

const Account = defineModel({
	name: 'Account',
	fields: (f) => ({ name: f.string({ unique: true }) }),
})

const open = async (name: string) => Account.create({ data: { name } }, M)
const names = async (): Promise<string[]> =>
	(await Account.findMany({ orderBy: { name: 'asc' } }, M)).map(
		(account) => account.name,
	)

/**
 * Opens `name` in a serializable transaction when it reads no account. Its
 * first attempt waits for the other's read, unless the adapter makes that
 * one wait for this commit (D-179).
 */
async function claim(
	name: string,
	read: PromiseWithResolvers<void>,
	theirs: Promise<void>,
): Promise<void> {
	let attempt = 0
	await transaction(
		async () => {
			attempt += 1
			const taken = await names()
			read.resolve()
			if (attempt === 1) await Promise.race([theirs, setTimeout(50)])
			if (taken.length === 0) await open(name)
		},
		{ isolation: 'serializable' },
	)
}

export function transactions(create: () => Adapter): void {
	describe('transactions', () => {
		started(create, [Account])

		it('commits every write together', async () => {
			await transaction(async () => {
				await open('bob')
				await open('cy')
			})
			expect(await names()).toEqual(['bob', 'cy'])
		})

		it('reads its own writes', async () => {
			const seen = await transaction(async () => {
				await open('bob')
				return names()
			})
			expect(seen).toEqual(['bob'])
		})

		it('rolls every write back when the callback throws', async () => {
			await open('ann')
			const failed = transaction(async () => {
				await open('bob')
				throw new Error('Stop.')
			})
			await expect(failed).rejects.toThrow('Stop.')
			expect(await names()).toEqual(['ann'])
		})

		it('rolls back after a failed write, even one the callback catches', async () => {
			const failed = transaction(async () => {
				await open('bob')
				await open('bob').catch(() => undefined)
			})
			await expect(failed).rejects.toMatchObject({ code: 'UNIQUE_VIOLATION' })
			expect(await names()).toEqual([])
		})

		it('shows its writes to no one else before the commit', async () => {
			const written = Promise.withResolvers<void>()
			const resumed = Promise.withResolvers<void>()
			const running = transaction(async () => {
				await open('bob')
				written.resolve()
				await resumed.promise
			})
			await written.promise
			// This read runs outside the transaction.
			expect(await names()).toEqual([])
			resumed.resolve()
			await running
			expect(await names()).toEqual(['bob'])
		})

		it('never commits two serializable transactions that each read what the other writes', async () => {
			const ann = Promise.withResolvers<void>()
			const bob = Promise.withResolvers<void>()
			await Promise.all([
				claim('ann', ann, bob.promise),
				claim('bob', bob, ann.promise),
			])
			expect(await names()).toHaveLength(1)
		})
	})
}
