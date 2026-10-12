import { Pointer } from '@ultimabase/core'
import {
	resolveRequestRoleReference,
	type RequestRoleSubject,
} from '@ultimabase/plugin-kit'
import { immutableArray } from '@ultimabase/shared'

import {
	expandACLPermissions,
	normalizeACLPermissions,
	type ACLPermission,
	type ACLPermissionInput,
	type ACLPrincipal,
} from './acl-contracts.js'
import { createACLEntries, principalKey, type ACLEntry } from './acl-entries.js'
import {
	createACLJSON,
	parseACLJSON,
	type ACLJSON,
	type ACLPrincipalJSON,
	type ACLRoleJSON,
} from './acl-json.js'

const ownerPermissions: readonly ACLPermission[] = immutableArray([
	'read',
	'update',
	'delete',
])

/** Keeps each instance's state, its canonical frozen document, private. */
const documents = new WeakMap<object, ACLJSON>()
/** Principal Pointers granted on this instance, so `entries()` returns them. */
const pointers = new WeakMap<object, ReadonlyMap<string, Pointer>>()
const noPointers: ReadonlyMap<string, Pointer> = new Map()

const emptyDocument: ACLJSON = createACLJSON({
	version: 1,
	public: [],
	authenticated: [],
	principals: [],
	roles: [],
})

const stateOf = (acl: ACL): ACLJSON => {
	const document = documents.get(acl)
	if (document === undefined) {
		throw new TypeError('ACL method requires an ACL instance')
	}
	return document
}

/** Derives the next right set from the current and requested rights. */
type PermissionChange = (
	current: readonly ACLPermission[],
	requested: readonly ACLPermission[],
) => readonly ACLPermission[]

const grant: PermissionChange = (current, requested) =>
	normalizeACLPermissions([...current, ...requested])

const revoke: PermissionChange = (current, requested) => {
	const revoked = normalizeACLPermissions(requested)
	return current.filter((permission) => !revoked.includes(permission))
}

const replace: PermissionChange = (_current, requested) =>
	normalizeACLPermissions(requested)

/** Reads one subject's rights from a document and writes replacements back. */
interface SubjectSlot {
	readonly read: (document: ACLJSON) => readonly ACLPermission[]
	readonly write: (
		document: ACLJSON,
		permissions: readonly ACLPermission[],
	) => ACLJSON
	/** The Pointer this slot names, retained for `entries()`. */
	readonly pointer?: Pointer
}

const audienceSlot = (audience: 'authenticated' | 'public'): SubjectSlot => ({
	read: (document) => document[audience],
	write: (document, permissions) => ({ ...document, [audience]: permissions }),
})
const publicSlot = audienceSlot('public')
const authenticatedSlot = audienceSlot('authenticated')

/** Replaces the entry selected by `matches`; `undefined` removes it. */
const replaceEntry = <TEntry>(
	entries: readonly TEntry[],
	matches: (entry: TEntry) => boolean,
	replacement: TEntry | undefined,
): readonly TEntry[] => [
	...entries.filter((entry) => !matches(entry)),
	...(replacement === undefined ? [] : [replacement]),
]

const principalSlot = (candidate: ACLPrincipal): SubjectSlot => {
	const principal: unknown = candidate
	if (!Pointer.is(principal)) {
		throw new TypeError('ACL principal must be a Pointer')
	}
	const { className, id } = principal.toJSON()
	const matches = (entry: ACLPrincipalJSON): boolean =>
		entry.className === className && entry.id === id

	return {
		pointer: principal,
		read: (document) => document.principals.find(matches)?.permissions ?? [],
		write: (document, permissions) => ({
			...document,
			principals: replaceEntry(
				document.principals,
				matches,
				permissions.length === 0 ? undefined : { className, id, permissions },
			),
		}),
	}
}

const roleSlot = (role: RequestRoleSubject): SubjectSlot => {
	const { value } = resolveRequestRoleReference(role)
	const matches = (entry: ACLRoleJSON): boolean => entry.value === value

	return {
		read: (document) => document.roles.find(matches)?.permissions ?? [],
		write: (document, permissions) => ({
			...document,
			roles: replaceEntry(
				document.roles,
				matches,
				permissions.length === 0
					? undefined
					: { kind: 'role', permissions, value },
			),
		}),
	}
}

/** Derives a new ACL whose `slot` rights are `change(current, requested)`. */
const edit = (
	acl: ACL,
	slot: SubjectSlot,
	change: PermissionChange,
	requested: readonly ACLPermissionInput[],
): ACL => {
	const document = stateOf(acl)
	const known = pointers.get(acl) ?? noPointers
	return createACL(
		slot.write(
			document,
			change(slot.read(document), expandACLPermissions(requested)),
		),
		slot.pointer === undefined
			? known
			: new Map([...known, [principalKey(slot.pointer), slot.pointer]]),
	)
}

/** Returns a detached frozen copy of one subject's rights. */
const snapshot = (
	slot: SubjectSlot,
	document: ACLJSON,
): readonly ACLPermission[] => immutableArray(slot.read(document))

/**
 * Represents immutable object-level grants without performing persistence.
 *
 * Every modifier returns a new ACL, so earlier branches remain safe to reuse.
 *
 * @example
 * ```ts
 * const acl = new ACL()
 *   .grantPublic('read')
 *   .grantPrincipal(User.pointer(userId), 'read', 'update')
 * ```
 */
export class ACL {
	/**
	 * Reconstructs one canonical ACL from its complete untrusted JSON boundary.
	 *
	 * @example `const acl = ACL.fromJSON(JSON.parse(serialized))`
	 */
	static fromJSON(value: unknown): ACL {
		return createACL(parseACLJSON(value))
	}

	/**
	 * Creates an empty ACL, or one where `owner` may read, update and delete
	 * (like `new Parse.ACL(user)`). An `undefined` owner, such as the principal
	 * of an anonymous request, gives an empty ACL.
	 *
	 * @example `default: ({ principal }) => new ACL(principal)`
	 */
	constructor(owner?: ACLPrincipal) {
		if (new.target !== ACL) {
			throw new TypeError('ACL cannot be subclassed')
		}
		const candidate: unknown = owner
		if (candidate !== undefined && !Pointer.is(candidate)) {
			throw new TypeError('ACL owner must be a Core Pointer')
		}

		documents.set(
			this,
			owner === undefined
				? emptyDocument
				: createACLJSON(
						principalSlot(owner).write(
							emptyDocument,
							grant([], ownerPermissions),
						),
					),
		)
		if (Pointer.is(candidate)) {
			pointers.set(this, new Map([[principalKey(candidate), candidate]]))
		}
		Object.freeze(this)
	}

	/** Adds public rights without replacing existing public rights. */
	grantPublic(...permissions: readonly ACLPermissionInput[]): ACL {
		return edit(this, publicSlot, grant, permissions)
	}

	/** Removes only the supplied public rights. */
	revokePublic(...permissions: readonly ACLPermissionInput[]): ACL {
		return edit(this, publicSlot, revoke, permissions)
	}

	/** Replaces the complete public right set; no rights clears it. */
	setPublicPermissions(...permissions: readonly ACLPermissionInput[]): ACL {
		return edit(this, publicSlot, replace, permissions)
	}

	/** Returns a detached readonly snapshot of public rights. */
	permissionsForPublic(): readonly ACLPermission[] {
		return snapshot(publicSlot, stateOf(this))
	}

	/** Reports whether public access owns one exact right. */
	hasPublicPermission(permission: ACLPermission): boolean {
		return this.permissionsForPublic().includes(permission)
	}

	/** Adds authenticated-principal rights without replacing existing rights. */
	grantAuthenticated(...permissions: readonly ACLPermissionInput[]): ACL {
		return edit(this, authenticatedSlot, grant, permissions)
	}

	/** Removes only the supplied authenticated-principal rights. */
	revokeAuthenticated(...permissions: readonly ACLPermissionInput[]): ACL {
		return edit(this, authenticatedSlot, revoke, permissions)
	}

	/** Replaces the authenticated-principal right set; no rights clears it. */
	setAuthenticatedPermissions(
		...permissions: readonly ACLPermissionInput[]
	): ACL {
		return edit(this, authenticatedSlot, replace, permissions)
	}

	/** Returns a detached readonly snapshot of authenticated-principal rights. */
	permissionsForAuthenticated(): readonly ACLPermission[] {
		return snapshot(authenticatedSlot, stateOf(this))
	}

	/** Reports whether every authenticated principal owns one exact right. */
	hasAuthenticatedPermission(permission: ACLPermission): boolean {
		return this.permissionsForAuthenticated().includes(permission)
	}

	/** Adds rights for one exact schema-qualified principal Pointer. */
	grantPrincipal(
		principal: ACLPrincipal,
		...permissions: readonly ACLPermissionInput[]
	): ACL {
		return edit(this, principalSlot(principal), grant, permissions)
	}

	/** Removes only the supplied rights from one exact principal. */
	revokePrincipal(
		principal: ACLPrincipal,
		...permissions: readonly ACLPermissionInput[]
	): ACL {
		return edit(this, principalSlot(principal), revoke, permissions)
	}

	/** Replaces one principal's complete right set; no rights removes the entry. */
	setPrincipalPermissions(
		principal: ACLPrincipal,
		...permissions: readonly ACLPermissionInput[]
	): ACL {
		return edit(this, principalSlot(principal), replace, permissions)
	}

	/** Returns a detached readonly snapshot of one principal's rights. */
	permissionsForPrincipal(principal: ACLPrincipal): readonly ACLPermission[] {
		return snapshot(principalSlot(principal), stateOf(this))
	}

	/** Reports whether one exact principal owns one exact right. */
	hasPrincipalPermission(
		principal: ACLPrincipal,
		permission: ACLPermission,
	): boolean {
		return this.permissionsForPrincipal(principal).includes(permission)
	}

	/** Adds rights for one neutral role reference or persisted role carrier. */
	grantRole(
		role: RequestRoleSubject,
		...permissions: readonly ACLPermissionInput[]
	): ACL {
		return edit(this, roleSlot(role), grant, permissions)
	}

	/** Removes only the supplied rights from one neutral role subject. */
	revokeRole(
		role: RequestRoleSubject,
		...permissions: readonly ACLPermissionInput[]
	): ACL {
		return edit(this, roleSlot(role), revoke, permissions)
	}

	/** Replaces one role's complete right set; no rights removes the entry. */
	setRolePermissions(
		role: RequestRoleSubject,
		...permissions: readonly ACLPermissionInput[]
	): ACL {
		return edit(this, roleSlot(role), replace, permissions)
	}

	/** Returns a detached readonly snapshot of one role's rights. */
	permissionsForRole(role: RequestRoleSubject): readonly ACLPermission[] {
		return snapshot(roleSlot(role), stateOf(this))
	}

	/** Reports whether one neutral role subject owns one exact right. */
	hasRolePermission(
		role: RequestRoleSubject,
		permission: ACLPermission,
	): boolean {
		return this.permissionsForRole(role).includes(permission)
	}

	/**
	 * Lists who holds which rights (ADR-0321): `public` and `authenticated`
	 * when they hold any, users as Pointers, roles as references whose name
	 * Roles' `resolveRoleReference` reads.
	 *
	 * @example
	 * ```ts
	 * for (const entry of acl.entries()) {
	 *   if (entry.kind === 'principal') console.log(entry.principal.id, entry.permissions)
	 * }
	 * ```
	 */
	entries(): readonly ACLEntry[] {
		return createACLEntries(stateOf(this), pointers.get(this) ?? noPointers)
	}

	/**
	 * Returns one deeply detached canonical JSON snapshot of this ACL.
	 *
	 * @example `const document = acl.toJSON()`
	 */
	toJSON(): ACLJSON {
		// Re-canonicalizing copies every nested record, detaching each snapshot.
		return createACLJSON(stateOf(this))
	}
}

/** Creates one ACL shell and attaches its canonical private document. */
const createACL = (
	document: ACLJSON,
	known: ReadonlyMap<string, Pointer> = noPointers,
): ACL => {
	const acl = new ACL()
	documents.set(acl, createACLJSON(document))
	if (known.size > 0) pointers.set(acl, known)
	return acl
}
