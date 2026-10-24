// What the functions and the commands share (D-113): signing a user up,
// checking a password, setting one, and the session a success opens.
import type { AuthApi } from '@ultimabase/auth'
import type { Caller, Client, ExposedModel, Row } from 'ultimabase'
import { master, PublicError, transaction } from 'ultimabase'
import { dummyHash, hashPassword, verifyPassword } from './hash.ts'
import type { Attempt } from './models.ts'
import { limited, PasswordHash } from './models.ts'

const M = { as: master }
/** The method `AuthAccount` links a password's email with (D-113). */
const method = 'password'

/** What each running application's password reads, by auth's API. */
export interface State {
	readonly auth: AuthApi
	readonly users: ExposedModel
	/** The fields a sign-up other than Master's takes, `false` when closed. */
	readonly signUp: ReadonlySet<string> | false
}

/** What a sign-in returns: its session, and the user read as itself. */
export interface SignedIn<U = Row> {
	readonly token: string
	readonly expiresAt: Date
	readonly user: U | null
}

const invalid = () =>
	new PublicError('INVALID_CREDENTIALS', 'Wrong email or password.')

/** The attempt a client makes for `subject`; server code is not counted. */
export const attemptOf = (
	subject: string,
	client: Client | undefined,
): Attempt =>
	client === undefined ? undefined : { subject, address: client.address }

/**
 * Creates the user, its account and its hash in one transaction, as Master:
 * the caller's fields were checked against the list (D-113).
 */
export async function createUser(
	state: State,
	email: string,
	password: string,
	data: object,
): Promise<Row> {
	const hash = await hashPassword(password)
	return transaction(async () => {
		const user = await state.users.queries.create({ data }, M)
		await state.auth.linkAccount(user.id, method, email)
		await PasswordHash.create({ data: { userId: user.id, hash } }, M)
		return user
	})
}

/** Whether `password` is `userId`'s, rehashing a stale hash on a match. */
async function matches(
	userId: string | undefined,
	password: string,
): Promise<boolean> {
	const stored =
		userId === undefined
			? null
			: await PasswordHash.findUnique({ where: { userId } }, M)
	// An unknown user costs a hash too, so the time tells nothing (D-113).
	const { valid, stale } = await verifyPassword(
		password,
		stored?.hash ?? (await dummyHash()),
	)
	if (stored === null || !valid) return false
	if (stale) {
		const hash = await hashPassword(password)
		await PasswordHash.update(
			{ where: { userId: stored.userId }, data: { hash } },
			M,
		)
	}
	return true
}

/** The user `email` and `password` sign in as, counting the attempt. */
export async function verified(
	state: State,
	email: string,
	password: string,
	attempt: Attempt,
): Promise<string> {
	return limited(attempt, async () => {
		const account = await state.auth.accountOf(method, email)
		if (!(await matches(account?.userId, password)) || account === undefined) {
			throw invalid()
		}
		return account.userId
	})
}

/** Checks `userId`'s current password, counting the attempt. */
export async function checkCurrent(
	userId: string,
	password: string,
	attempt: Attempt,
): Promise<void> {
	await limited(attempt, async () => {
		if (!(await matches(userId, password))) throw invalid()
	})
}

/** Replaces `userId`'s hash and ends every session of the user. */
export async function setPassword(
	state: State,
	userId: string,
	password: string,
): Promise<void> {
	const stored = await PasswordHash.findUnique({ where: { userId } }, M)
	if (stored === null) {
		throw new PublicError(
			'NOT_FOUND',
			`User ${userId} has no password: sign it up with signUp (D-113).`,
		)
	}
	const hash = await hashPassword(password)
	await PasswordHash.update({ where: { userId }, data: { hash } }, M)
	await state.auth.revokeSessions(userId)
}

/** The user as it reads itself, so its own field rules apply (D-113). */
async function asItself(state: State, userId: string): Promise<Row | null> {
	const { queries } = state.users
	const user = await queries.findUnique({ where: { id: userId } }, M)
	if (user === null) return null
	const caller: Caller = { kind: 'user', user }
	return queries.findUnique({ where: { id: userId } }, { as: caller })
}

/** Opens a session for `userId`, with its cookie when a client is given. */
export async function signedIn(
	state: State,
	userId: string,
	client: Client | undefined,
): Promise<SignedIn> {
	const { token, expiresAt } = await state.auth.signIn(userId, client)
	return { token, expiresAt, user: await asItself(state, userId) }
}
