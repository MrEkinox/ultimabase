// What the functions and the commands share (D-113): signing a user up,
// checking a password, setting one, and the session a success opens.
import { randomUUID } from 'node:crypto'
import type { AuthApi } from '@ultimabase/auth'
import type {
	Client,
	Identity,
	ExposedModel,
	Logger,
	Register,
	Row,
	UserOf,
} from 'ultimabase'
import { master, PublicError, transaction } from 'ultimabase'
import { dummyHash, hashPassword, verifyPassword } from './hash.ts'
import type { SendEmail } from './email-functions.ts'
import { normalized } from './input.ts'
import type { Attempt } from './models.ts'
import { limited, PasswordHash } from './models.ts'
import { PasswordToken } from './tokens.ts'

const M = { as: master }
/** The method `AuthAccount` links a password's email with (D-113). */
export const method = 'password'

/** What each running application's password reads, by auth's API. */
export interface State {
	readonly auth: AuthApi
	readonly users: ExposedModel
	/** The fields a sign-up other than Master's takes, `false` when closed. */
	readonly signUp: ReadonlySet<string> | false
	readonly logger: Logger
	/** The sends under way, which stopping waits for (D-117). */
	readonly sending: Set<Promise<void>>
	readonly sendEmail: SendEmail | undefined
}

/** The `passwordSetAt` each `setPassword` wrote, which its commit tells (D-169). */
const setting = new Set<string>()

/** Whether `setPassword` wrote `at` for `userId`, told once. */
export const passwordSet = (userId: string, at: Date): boolean =>
	setting.delete(`${userId} ${at.getTime()}`)

/** What a sign-in returns: its session, and the user read as itself. */
export interface SignedIn<U = Row> {
	/**
	 * The session's token, there even when the cookie carries it: a mobile
	 * client needs it, and a function cannot tell one client from another
	 * (D-115).
	 */
	readonly token: string
	readonly expiresAt: Date
	readonly user: U | null
}

const invalid = () =>
	new PublicError('INVALID_CREDENTIALS', 'Wrong email or password.')

/** The current password is known to be the user's: no email to name (D-161). */
const wrongPassword = () =>
	new PublicError('INVALID_CREDENTIALS', 'Wrong password.')

/** The attempt a client makes for `subject`; server code is not counted. */
export const attemptOf = (
	subject: string,
	client: Client | undefined,
): Attempt =>
	client === undefined ? undefined : { subject, address: client.address }

/**
 * Creates the user, its account and its hash in one transaction, as Master:
 * the caller's fields were checked against the list (D-113). The email's
 * hook links the account (D-162); `passwordSetAt` is the sign-up's (D-169).
 */
export async function createUser(
	state: State,
	email: string,
	password: string,
	data: object,
): Promise<{ readonly user: Row; readonly stamp: string }> {
	const hash = await hashPassword(password)
	const stamp = randomUUID()
	return transaction(async () => {
		const user = await state.users.queries.create(
			{ data: { ...data, email, passwordSetAt: new Date() } },
			M,
		)
		await PasswordHash.create({ data: { userId: user.id, hash, stamp } }, M)
		return { user, stamp }
	})
}

/** Rehashes the password `stamp` names, unless it was set since. */
async function rehash(stamp: string, password: string): Promise<void> {
	const hash = await hashPassword(password)
	try {
		await PasswordHash.update({ where: { stamp }, data: { hash } }, M)
	} catch (error) {
		if (!(error instanceof PublicError && error.code === 'NOT_FOUND')) {
			throw error
		}
	}
}

/** No stored password is longer, so a longer one is not hashed. */
const longest = 256

/**
 * The stamp of `userId`'s password when `password` is it, rehashing a stale
 * hash; `undefined` otherwise.
 */
async function matches(
	userId: string | undefined,
	typed: string,
): Promise<string | undefined> {
	const password = normalized(typed)
	if (Array.from(password).length > longest) return undefined
	const stored =
		userId === undefined
			? null
			: await PasswordHash.findUnique({ where: { userId } }, M)
	// An unknown user costs a hash too, so the time tells nothing (D-113).
	const { valid, stale } = await verifyPassword(
		password,
		stored?.hash ?? (await dummyHash()),
	)
	if (stored === null || !valid) return undefined
	if (stale) await rehash(stored.stamp, password)
	return stored.stamp
}

/** A user whose password checked, and the stamp it checked against. */
export interface Verified {
	readonly userId: string
	readonly stamp: string
}

/** The user `email` and `password` sign in as, counting the attempt. */
export async function verified(
	state: State,
	email: string,
	password: string,
	attempt: Attempt,
): Promise<Verified> {
	return limited(attempt, async () => {
		const account = await state.auth.accountOf(method, email)
		const stamp = await matches(account?.userId, password)
		if (stamp === undefined || account === undefined) throw invalid()
		return { userId: account.userId, stamp }
	})
}

/** Checks `userId`'s current password, counting the attempt. */
export async function checkCurrent(
	userId: string,
	password: string,
	attempt: Attempt,
): Promise<void> {
	await limited(attempt, async () => {
		if ((await matches(userId, password)) === undefined) throw wrongPassword()
	})
}

/**
 * Replaces `userId`'s hash, or gives one to an email without (D-162), ends
 * every session of the user, deletes its pending reset tokens (D-117) and
 * sets `passwordSetAt` (D-169); the new stamp.
 */
export async function setPassword(
	state: State,
	userId: string,
	password: string,
): Promise<string> {
	const stored = await PasswordHash.findUnique({ where: { userId } }, M)
	const linked =
		stored !== null ||
		(await state.auth.subjectOf(userId, method)) !== undefined
	if (!linked) {
		throw new PublicError(
			'NOT_FOUND',
			`User ${userId} has no password: sign it up with signUp.`,
		)
	}
	const hash = await hashPassword(password)
	const stamp = randomUUID()
	await transaction(async () => {
		const data = { hash, stamp }
		await (stored === null
			? PasswordHash.create({ data: { userId, ...data } }, M)
			: PasswordHash.update({ where: { userId }, data }, M))
		await PasswordToken.deleteMany({ where: { userId, kind: 'reset' } }, M)
		await state.auth.revokeSessions(userId)
		// Through the user's queries, so the application's hooks see it, and
		// password's own tells the account once it commits (D-169).
		const passwordSetAt = new Date()
		if (state.sendEmail !== undefined) {
			setting.add(`${userId} ${passwordSetAt.getTime()}`)
		}
		await state.users.queries.update(
			{ where: { id: userId }, data: { passwordSetAt } },
			M,
		)
	})
	// Again once the stamp is visible: a sign-in that read the old one opened
	// its session before, so this ends it (see `signedIn`).
	await state.auth.revokeSessions(userId)
	return stamp
}

/** The user as it reads itself, so its own field rules apply (D-113). */
async function asItself(state: State, userId: string): Promise<Row | null> {
	const { queries } = state.users
	// A transport's queries are untyped; this is the user model's row.
	const user: unknown = await queries.findUnique({ where: { id: userId } }, M)
	if (user === null) return null
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the user model is the one the application registers (D-62, D-80).
	const caller: Identity = { kind: 'user', user: user as UserOf<Register> }
	return queries.findUnique({ where: { id: userId } }, { as: caller })
}

/**
 * Opens a session for the user, with its cookie when a client is given. The
 * stamp is read after: a password set since the check ends the user's
 * sessions and fails, an older read means `setPassword` ends this one (D-113).
 */
export async function signedIn(
	state: State,
	{ userId, stamp }: Verified,
	client: Client | undefined,
): Promise<SignedIn> {
	const { token, expiresAt } = await state.auth.signIn(userId, client)
	const stored = await PasswordHash.findUnique({ where: { userId } }, M)
	if (stored?.stamp !== stamp) {
		await state.auth.revokeSessions(userId)
		throw invalid()
	}
	return { token, expiresAt, user: await asItself(state, userId) }
}
