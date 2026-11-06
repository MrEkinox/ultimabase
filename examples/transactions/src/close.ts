// Closes an account: its balance goes to another, and the account is deleted,
// both or neither.
//#region close
import { master, transaction } from 'ultimabase'
import { Account } from './models.ts'

export const closeAccount = (from: string, to: string) =>
	transaction(async () => {
		const as = { as: master }
		const { balance } = await Account.delete({ where: { id: from } }, as)
		await Account.update(
			{ where: { id: to }, data: { balance: { increment: balance } } },
			as,
		)
	})
//#endregion
