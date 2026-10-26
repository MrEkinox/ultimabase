// The `ACL` class (D-124): who may read and who may write one row, as
// entries `read:*`, `read:user:<id>` and `write:role:<id>`. Each method
// returns a new ACL.
import { rolesOf } from '@ultimabase/roles'
import type { Caller } from 'ultimabase'

/** `write` is update and delete (D-124). */
export type Permission = 'read' | 'write'

/** What a client reads, and may send: the subjects of each permission. */
export type AclJson = {
	readonly read: readonly string[]
	readonly write: readonly string[]
}

const permissions: readonly Permission[] = ['read', 'write']

const isSubject = (subject: string): boolean =>
	subject === '*' || /^(?:user|role):.+$/u.test(subject)

/** The entry's permission, or `undefined` when it is not an entry. */
function permissionOf(entry: string): Permission | undefined {
	const permission = permissions.find((each) => entry.startsWith(`${each}:`))
	if (permission === undefined) return undefined
	return isSubject(entry.slice(permission.length + 1)) ? permission : undefined
}

/** The permissions given, or both when none is. */
const given = (perms: readonly Permission[]): readonly Permission[] =>
	perms.length === 0 ? permissions : perms

/**
 * The ACL a value is, or what it lacks: an `ACL`, or `{ read, write }`
 * listing subjects `*`, `user:<id>` or `role:<id>`.
 */
export function parsed(value: unknown): ACL | string {
	if (value instanceof ACL) return value
	if (typeof value !== 'object' || value === null) {
		return 'An ACL is an ACL or { read, write }.'
	}
	const entries: string[] = []
	for (const key of Object.keys(value)) {
		const permission = permissions.find((each) => each === key)
		if (permission === undefined) return `${key} is not a permission.`
		const subjects: unknown = Reflect.get(value, key)
		if (!Array.isArray(subjects)) return `${key} is a list of subjects.`
		for (const [index, subject] of subjects.entries()) {
			if (typeof subject !== 'string' || !isSubject(subject)) {
				return `${key}[${index}]: a subject is *, user:<id> or role:<id>.`
			}
			entries.push(`${permission}:${subject}`)
		}
	}
	return ACL.fromEntries(entries)
}

/** Who may read and who may write one row; empty, only Master (D-124). */
export class ACL {
	#entries: ReadonlySet<string> = new Set()

	static #of(entries: ReadonlySet<string>): ACL {
		const acl = new ACL()
		acl.#entries = entries
		return acl
	}

	/** Its entries as stored, as `['read:*', 'write:user:u_1']`. */
	static fromEntries(entries: Iterable<string>): ACL {
		const kept = new Set<string>()
		for (const entry of entries) {
			if (permissionOf(entry) === undefined) {
				throw new TypeError(`${entry} is not an ACL entry.`)
			}
			kept.add(entry)
		}
		return ACL.#of(kept)
	}

	/** What `toJSON` gives, or a client sends. */
	static fromJSON(json: unknown): ACL {
		const acl = parsed(json)
		if (typeof acl === 'string') throw new TypeError(acl)
		return acl
	}

	#changed(subject: string, perms: readonly Permission[], add: boolean): ACL {
		const entries = new Set(this.#entries)
		for (const permission of given(perms)) {
			const entry = `${permission}:${subject}`
			if (add) entries.add(entry)
			else entries.delete(entry)
		}
		return ACL.#of(entries)
	}

	allowPublic(...perms: readonly Permission[]): ACL {
		return this.#changed('*', perms, true)
	}

	allowUser(
		user: { readonly id: string },
		...perms: readonly Permission[]
	): ACL {
		return this.#changed(`user:${user.id}`, perms, true)
	}

	allowRole(
		role: { readonly id: string },
		...perms: readonly Permission[]
	): ACL {
		return this.#changed(`role:${role.id}`, perms, true)
	}

	denyPublic(...perms: readonly Permission[]): ACL {
		return this.#changed('*', perms, false)
	}

	denyUser(
		user: { readonly id: string },
		...perms: readonly Permission[]
	): ACL {
		return this.#changed(`user:${user.id}`, perms, false)
	}

	denyRole(
		role: { readonly id: string },
		...perms: readonly Permission[]
	): ACL {
		return this.#changed(`role:${role.id}`, perms, false)
	}

	publicCan(permission: Permission): boolean {
		return this.#entries.has(`${permission}:*`)
	}

	userCan(user: { readonly id: string }, permission: Permission): boolean {
		return this.#entries.has(`${permission}:user:${user.id}`)
	}

	roleCan(role: { readonly id: string }, permission: Permission): boolean {
		return this.#entries.has(`${permission}:role:${role.id}`)
	}

	/** The ids of the users having the permission. */
	users(permission: Permission): readonly string[] {
		return this.#ids(`${permission}:user:`)
	}

	/** The ids of the roles having the permission. */
	roles(permission: Permission): readonly string[] {
		return this.#ids(`${permission}:role:`)
	}

	#ids(prefix: string): readonly string[] {
		return this.entries()
			.filter((entry) => entry.startsWith(prefix))
			.map((entry) => entry.slice(prefix.length))
	}

	/**
	 * Whether the caller has the permission, through the public, its user or
	 * one of its roles; a write needs the read too, as the queries do. True
	 * for Master.
	 */
	allows(caller: Caller, permission: Permission): boolean {
		if (caller.kind === 'master') return true
		const keys = subjectsOf(caller)
		const has = (wanted: Permission) =>
			keys.some((key) => this.#entries.has(`${wanted}:${key}`))
		return has('read') && (permission === 'read' || has('write'))
	}

	/** Its entries as stored, sorted. */
	entries(): readonly string[] {
		return [...this.#entries].toSorted()
	}

	/** What a client reads: `{ read: ['*'], write: ['user:u_1'] }`. */
	toJSON(): AclJson {
		const subjects = (permission: Permission) =>
			this.entries()
				.filter((entry) => permissionOf(entry) === permission)
				.map((entry) => entry.slice(permission.length + 1))
		return { read: subjects('read'), write: subjects('write') }
	}
}

/** The subjects a caller other than Master is: `*`, its user, its roles. */
export function subjectsOf(caller: Caller): readonly string[] {
	if (caller.kind !== 'user') return ['*']
	return [
		'*',
		`user:${caller.user.id}`,
		...rolesOf(caller).map(({ id }) => `role:${id}`),
	]
}
