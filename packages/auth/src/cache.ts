// The callers kept by token (D-332): a request whose session and user have
// not changed reads neither again. What the feed says changed is given up,
// on every server; what this process ends, at once.
import type { Changed, Identity } from 'ultimabase'

/** The most tokens each application keeps, the oldest given up first. */
export const kept = { most: 10_000 }

/** A session's caller, as a read gives it to the cache. */
export interface Read {
	readonly caller: Identity
	readonly sessionId: string
	readonly userId: string
	readonly expiresAt: Date
	/** When the session is next renewed, or ends: it is read again then. */
	readonly renewAt: number
}

/** One application's callers, by token. */
export interface Cache {
	/** The caller `token` gave, while nothing changed it. */
	readonly hit: (token: string) => Read | undefined
	/** Reads `token` with `read`, kept unless a change came meanwhile. */
	readonly through: (
		token: string,
		read: () => Promise<Read | undefined>,
	) => Promise<Read | undefined>
	readonly changed: (changes: readonly Changed[]) => void
	readonly lost: () => void
	readonly missed: () => void
	readonly dropToken: (token: string) => void
	readonly dropUser: (userId: string) => void
}

/** The running applications' caches, for what this process ends. */
export const live: Set<Cache> = new Set()

/** Gives up `token` in every running application of this process. */
export function droppedToken(token: string): void {
	for (const cache of live) cache.dropToken(token)
}

/** Gives up `userId`'s tokens in every running application of this process. */
export function droppedUser(userId: string): void {
	for (const cache of live) cache.dropUser(userId)
}

/**
 * Runs `each` on the ids an update or a delete lists: true when it lists
 * none, so any row may have changed. An insert changes no kept row; a link,
 * no row at all.
 */
function taken(
	change: Changed,
	each: (id: string) => void,
): boolean | undefined {
	if (change.kind !== 'update' && change.kind !== 'delete') return undefined
	if (change.ids === undefined) return true
	for (const id of change.ids) each(id)
	return false
}

/** A cache for the user model `users`, in `live` while it runs. */
export function cacheOf(users: string): Cache {
	const byToken = new Map<string, Read>()
	const bySession = new Map<string, string>()
	const byUser = new Map<string, Set<string>>()
	/** Moves on at each drop: a read it spans keeps nothing. */
	let epoch = 0
	/** Between `lost` and `missed`, changes go unheard: nothing is kept. */
	let blind = false

	const drop = (token: string): void => {
		const entry = byToken.get(token)
		if (entry === undefined) return
		byToken.delete(token)
		bySession.delete(entry.sessionId)
		const tokens = byUser.get(entry.userId)
		tokens?.delete(token)
		if (tokens?.size === 0) byUser.delete(entry.userId)
	}
	const clear = (): void => {
		byToken.clear()
		bySession.clear()
		byUser.clear()
		epoch += 1
	}
	const dropToken = (token: string): void => {
		epoch += 1
		drop(token)
	}
	const dropUser = (userId: string): void => {
		epoch += 1
		for (const token of byUser.get(userId) ?? []) drop(token)
	}
	const dropSession = (sessionId: string): void => {
		epoch += 1
		const token = bySession.get(sessionId)
		if (token !== undefined) drop(token)
	}
	const keep = (token: string, read: Read): void => {
		drop(token)
		const first = byToken.keys().next()
		if (byToken.size >= kept.most && first.done !== true) drop(first.value)
		byToken.set(token, read)
		bySession.set(read.sessionId, token)
		const tokens = byUser.get(read.userId) ?? new Set()
		tokens.add(token)
		byUser.set(read.userId, tokens)
	}

	return {
		hit: (token) => {
			const entry = byToken.get(token)
			if (entry === undefined || blind) return undefined
			if (Date.now() < entry.renewAt) return entry
			drop(token)
			return undefined
		},
		through: async (token, read) => {
			const at = epoch
			const result = await read()
			if (result !== undefined && epoch === at && !blind) keep(token, result)
			return result
		},
		changed: (changes) => {
			for (const change of changes) {
				const whole =
					change.model === 'AuthSession'
						? taken(change, dropSession)
						: change.model === users
							? taken(change, dropUser)
							: undefined
				// A change that lists no ids may be any session or user.
				if (whole === true) clear()
			}
		},
		lost: () => {
			blind = true
			clear()
		},
		missed: () => {
			blind = false
			clear()
		},
		dropToken,
		dropUser,
	}
}
