// Moves money between two accounts: both writes, or neither.
//#region transfer
import { PublicError, defineFunction, master, transaction } from 'ultimabase'
import { z } from 'zod'
import { Account } from './models.ts'

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
