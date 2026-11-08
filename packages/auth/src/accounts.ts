// Linked accounts (D-113): one row per way a user signs in, unique on its
// method and the subject that method knows the user by.
import type { Field, ModelOf, One, ScalarOptions } from 'ultimabase'
import { AppUser, defineModel, master } from 'ultimabase'

const M = { as: master }

type AccountFields = {
	readonly user: One<() => typeof AppUser, { readonly onDelete: 'cascade' }>
	readonly method: Field<string, ScalarOptions<string>>
	readonly subject: Field<string, ScalarOptions<string>>
}

/** auth's own model (D-110), which goes with its user (D-333). */
export const AuthAccount: ModelOf<'AuthAccount', AccountFields, []> =
	defineModel({
		name: 'AuthAccount',
		fields: (f) => ({
			user: f.one(() => AppUser, { onDelete: 'cascade' }),
			method: f.string(),
			subject: f.string(),
		}),
		indexes: [
			{ fields: ['method', 'subject'], unique: true },
			{ fields: ['user'] },
		],
	})

/** Links `userId` to `subject` of `method`; a taken pair is a `UNIQUE_VIOLATION`. */
export async function linkAccount(
	userId: string,
	method: string,
	subject: string,
): Promise<void> {
	await AuthAccount.create(
		{ data: { user: { connect: { id: userId } }, method, subject } },
		M,
	)
}

/** The user `subject` of `method` signs in as, if any. */
export async function accountOf(
	method: string,
	subject: string,
): Promise<{ readonly userId: string } | undefined> {
	const [account] = await AuthAccount.findMany(
		{
			where: { method, subject },
			include: { user: { select: { id: true } } },
			take: 1,
		},
		M,
	)
	// A user in the trash signs in again once restored (D-333).
	const user = account?.user
	return user === undefined || user === null ? undefined : { userId: user.id }
}

/** The subject `userId` is known by to `method`, if linked (D-117). */
export async function subjectOf(
	userId: string,
	method: string,
): Promise<string | undefined> {
	const [account] = await AuthAccount.findMany(
		{ where: { user: { is: { id: userId } }, method }, take: 1 },
		M,
	)
	return account?.subject
}

/** Unlinks `userId`'s account of `method`; none linked is no error (D-162). */
export async function unlinkAccount(
	userId: string,
	method: string,
): Promise<void> {
	await AuthAccount.deleteMany(
		{ where: { user: { is: { id: userId } }, method } },
		M,
	)
}
