// Linked accounts (D-113): one row per way a user signs in, unique on its
// method and the subject that method knows the user by.
import type { Field, ModelOf, ScalarOptions } from 'ultimabase'
import { defineModel, master } from 'ultimabase'

const M = { as: master }

type AccountFields = {
	readonly userId: Field<string, ScalarOptions<string>>
	readonly method: Field<string, ScalarOptions<string>>
	readonly subject: Field<string, ScalarOptions<string>>
}

/** auth's own model (D-110). */
export const AuthAccount: ModelOf<'AuthAccount', AccountFields, []> =
	defineModel({
		name: 'AuthAccount',
		fields: (f) => ({
			userId: f.string(),
			method: f.string(),
			subject: f.string(),
		}),
		indexes: [
			{ fields: ['method', 'subject'], unique: true },
			{ fields: ['userId'] },
		],
	})

/** Links `userId` to `subject` of `method`; a taken pair is a `UNIQUE_VIOLATION`. */
export async function linkAccount(
	userId: string,
	method: string,
	subject: string,
): Promise<void> {
	await AuthAccount.create({ data: { userId, method, subject } }, M)
}

/** The user `subject` of `method` signs in as, if any. */
export async function accountOf(
	method: string,
	subject: string,
): Promise<{ readonly userId: string } | undefined> {
	const [account] = await AuthAccount.findMany(
		{ where: { method, subject }, take: 1 },
		M,
	)
	return account === undefined ? undefined : { userId: account.userId }
}

/** The subject `userId` is known by to `method`, if linked (D-117). */
export async function subjectOf(
	userId: string,
	method: string,
): Promise<string | undefined> {
	const [account] = await AuthAccount.findMany(
		{ where: { userId, method }, take: 1 },
		M,
	)
	return account?.subject
}

/** Unlinks every account of a user. */
export async function unlinkAccounts(userId: string): Promise<void> {
	await AuthAccount.deleteMany({ where: { userId } }, M)
}
