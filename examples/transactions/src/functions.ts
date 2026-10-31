// Moves money between two accounts: both writes, or neither. Likes a user,
// and matches the two when the other's like is there.
//#region transfer
import { PublicError, defineFunction, master, transaction } from 'ultimabase'
import { z } from 'zod'
import { Account, Like } from './models.ts'

export const transfer = defineFunction({
	name: 'transfer',
	input: z.object({ from: z.string(), to: z.string(), amount: z.int().min(1) }),
	run: async ({ input, caller }) => {
		// NOT_FOUND unless the caller owns the account.
		await Account.findUniqueOrThrow(
			{ where: { id: input.from } },
			{ as: caller },
		)
		const as = { as: master }
		await transaction(async () => {
			// The update locks the row: a second transfer waits for this one.
			const from = await Account.update(
				{
					where: { id: input.from },
					data: { balance: { decrement: input.amount } },
				},
				as,
			)
			if (from.balance < 0) {
				// Throwing rolls back the decrement.
				throw new PublicError('INSUFFICIENT_FUNDS', 'The balance is too low.')
			}
			await Account.update(
				{
					where: { id: input.to },
					data: { balance: { increment: input.amount } },
				},
				as,
			)
		})
	},
}).with({ access: ({ caller }) => caller.kind === 'user' })
//#endregion

//#region like
export const like = defineFunction({
	name: 'like',
	input: z.object({ user: z.string() }),
	output: z.object({ matched: z.boolean() }),
	run: async ({ input, caller }) => {
		const me = caller.kind === 'user' ? caller.user.id : ''
		const as = { as: master }
		// Two likes at once: one commits, the other runs again and matches.
		return transaction(
			async () => {
				const mine = await Like.create(
					{ data: { userId: me, targetId: input.user } },
					as,
				)
				const theirs = await Like.findFirst(
					{ where: { userId: input.user, targetId: me } },
					as,
				)
				if (theirs === null) return { matched: false }
				await Like.updateMany(
					{
						where: { id: { in: [mine.id, theirs.id] } },
						data: { matchedAt: new Date() },
					},
					as,
				)
				return { matched: true }
			},
			{ isolation: 'serializable' },
		)
	},
}).with({ access: ({ caller }) => caller.kind === 'user' })
//#endregion
