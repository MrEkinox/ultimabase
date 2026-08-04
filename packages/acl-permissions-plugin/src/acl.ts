import {
	AccessSubjectReference,
	Pointer,
	resolveAccessRoleReference,
	type AccessRoleReference,
	type AccessRoleSubject,
} from '@ultimabase/core'
import { immutableArray, immutableRecord } from '@ultimabase/shared'

import {
	normalizeACLPermissions,
	type ACLPermission,
	type ACLPrincipal,
} from './acl-contracts.js'
import { createACLJSON, parseACLJSON, type ACLJSON } from './acl-json.js'

interface PrincipalIdentity {
	readonly className: string
	readonly id: string
}

interface ACLSubjectEntry<TSubject> {
	readonly key: string
	readonly permissions: readonly ACLPermission[]
	readonly subject: TSubject
}

interface ACLState {
	readonly authenticated: readonly ACLPermission[]
	readonly principals: readonly ACLSubjectEntry<PrincipalIdentity>[]
	readonly public: readonly ACLPermission[]
	readonly roles: readonly ACLSubjectEntry<AccessRoleReference>[]
}

const aclStates = new WeakMap<object, ACLState>()

const createState = (input?: Partial<ACLState>): ACLState =>
	immutableRecord({
		authenticated: input?.authenticated ?? immutableArray([]),
		principals: input?.principals ?? immutableArray([]),
		public: input?.public ?? immutableArray([]),
		roles: input?.roles ?? immutableArray([]),
	})

const emptyState: ACLState = createState()

const requireState = (acl: ACL): ACLState => {
	const state = aclStates.get(acl)

	if (state === undefined) {
		throw new TypeError('ACL method requires an ACL instance')
	}

	return state
}

const grantPermissions = (
	current: readonly ACLPermission[],
	permissions: readonly ACLPermission[],
): readonly ACLPermission[] =>
	normalizeACLPermissions(immutableArray([...current, ...permissions]))

const revokePermissions = (
	current: readonly ACLPermission[],
	permissions: readonly ACLPermission[],
): readonly ACLPermission[] => {
	const revoked = normalizeACLPermissions(permissions)

	return immutableArray(
		current.filter((permission) => !revoked.includes(permission)),
	)
}

const compareEntryKeys = <TSubject>(
	left: ACLSubjectEntry<TSubject>,
	right: ACLSubjectEntry<TSubject>,
): number => (left.key < right.key ? -1 : left.key > right.key ? 1 : 0)

const updateSubjectEntry = <TSubject>(
	entries: readonly ACLSubjectEntry<TSubject>[],
	key: string,
	subject: TSubject,
	permissions: readonly ACLPermission[],
): readonly ACLSubjectEntry<TSubject>[] => {
	const retained = entries.filter((entry) => entry.key !== key)

	if (permissions.length > 0) {
		retained.push(immutableRecord({ key, permissions, subject }))
	}

	// Canonical subject ordering prepares stable serialization without exposing maps.
	retained.sort(compareEntryKeys)

	return immutableArray(retained)
}

const principalIdentity = (principal: ACLPrincipal): PrincipalIdentity => {
	if (!Pointer.is(principal)) {
		throw new TypeError('ACL principal must be a Pointer')
	}
	const serialized = principal.toJSON()

	return immutableRecord({
		className: serialized.className,
		id: serialized.id,
	})
}

const principalKey = (identity: PrincipalIdentity): string =>
	JSON.stringify([identity.className, identity.id])

const roleIdentity = (role: AccessRoleSubject): AccessRoleReference =>
	resolveAccessRoleReference(role)

const roleKey = (reference: AccessRoleReference): string => reference.value

const findPermissions = <TSubject>(
	entries: readonly ACLSubjectEntry<TSubject>[],
	key: string,
): readonly ACLPermission[] =>
	entries.find((entry) => entry.key === key)?.permissions ?? immutableArray([])

const snapshotPermissions = (
	permissions: readonly ACLPermission[],
): readonly ACLPermission[] => immutableArray(permissions)

type PermissionChange = (
	current: readonly ACLPermission[],
	requested: readonly ACLPermission[],
) => readonly ACLPermission[]

const setPermissions: PermissionChange = (_current, requested) =>
	normalizeACLPermissions(requested)

/** Reuses one immutable state transition for public and authenticated rights. */
const updateAudiencePermissions = (
	acl: ACL,
	audience: 'authenticated' | 'public',
	requested: readonly ACLPermission[],
	change: PermissionChange,
): ACL => {
	const state = requireState(acl)

	return createACL(
		createState({
			...state,
			[audience]: change(state[audience], requested),
		}),
	)
}

/** Reuses exact Pointer normalization for every principal state transition. */
const updatePrincipalPermissions = (
	acl: ACL,
	principal: ACLPrincipal,
	requested: readonly ACLPermission[],
	change: PermissionChange,
): ACL => {
	const state = requireState(acl)
	const identity = principalIdentity(principal)
	const key = principalKey(identity)

	return createACL(
		createState({
			...state,
			principals: updateSubjectEntry(
				state.principals,
				key,
				identity,
				change(findPermissions(state.principals, key), requested),
			),
		}),
	)
}

/** Reuses neutral role conversion for every role state transition. */
const updateRolePermissions = (
	acl: ACL,
	role: AccessRoleSubject,
	requested: readonly ACLPermission[],
	change: PermissionChange,
): ACL => {
	const state = requireState(acl)
	const reference = roleIdentity(role)
	const key = roleKey(reference)

	return createACL(
		createState({
			...state,
			roles: updateSubjectEntry(
				state.roles,
				key,
				reference,
				change(findPermissions(state.roles, key), requested),
			),
		}),
	)
}

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
		const document = parseACLJSON(value)

		return createACL(
			createState({
				authenticated: document.authenticated,
				principals: immutableArray(
					document.principals.map((entry) => {
						const subject = immutableRecord({
							className: entry.className,
							id: entry.id,
						})

						return immutableRecord({
							key: principalKey(subject),
							permissions: entry.permissions,
							subject,
						})
					}),
				),
				public: document.public,
				roles: immutableArray(
					document.roles.map((entry) => {
						const subject = new AccessSubjectReference('role', entry.value)

						return immutableRecord({
							key: roleKey(subject),
							permissions: entry.permissions,
							subject,
						})
					}),
				),
			}),
		)
	}

	constructor() {
		if (new.target !== ACL) {
			throw new TypeError('ACL cannot be subclassed')
		}

		aclStates.set(this, emptyState)
		Object.freeze(this)
	}

	/** Adds public rights without replacing existing public rights. */
	grantPublic(...permissions: readonly ACLPermission[]): ACL {
		return updateAudiencePermissions(
			this,
			'public',
			permissions,
			grantPermissions,
		)
	}

	/** Removes only the supplied public rights. */
	revokePublic(...permissions: readonly ACLPermission[]): ACL {
		return updateAudiencePermissions(
			this,
			'public',
			permissions,
			revokePermissions,
		)
	}

	/** Replaces the complete public right set; no rights clears it. */
	setPublicPermissions(...permissions: readonly ACLPermission[]): ACL {
		return updateAudiencePermissions(
			this,
			'public',
			permissions,
			setPermissions,
		)
	}

	/** Returns a detached readonly snapshot of public rights. */
	permissionsForPublic(): readonly ACLPermission[] {
		return snapshotPermissions(requireState(this).public)
	}

	/** Reports whether public access owns one exact right. */
	hasPublicPermission(permission: ACLPermission): boolean {
		return this.permissionsForPublic().includes(permission)
	}

	/** Adds authenticated-principal rights without replacing existing rights. */
	grantAuthenticated(...permissions: readonly ACLPermission[]): ACL {
		return updateAudiencePermissions(
			this,
			'authenticated',
			permissions,
			grantPermissions,
		)
	}

	/** Removes only the supplied authenticated-principal rights. */
	revokeAuthenticated(...permissions: readonly ACLPermission[]): ACL {
		return updateAudiencePermissions(
			this,
			'authenticated',
			permissions,
			revokePermissions,
		)
	}

	/** Replaces the authenticated-principal right set; no rights clears it. */
	setAuthenticatedPermissions(...permissions: readonly ACLPermission[]): ACL {
		return updateAudiencePermissions(
			this,
			'authenticated',
			permissions,
			setPermissions,
		)
	}

	/** Returns a detached readonly snapshot of authenticated-principal rights. */
	permissionsForAuthenticated(): readonly ACLPermission[] {
		return snapshotPermissions(requireState(this).authenticated)
	}

	/** Reports whether every authenticated principal owns one exact right. */
	hasAuthenticatedPermission(permission: ACLPermission): boolean {
		return this.permissionsForAuthenticated().includes(permission)
	}

	/** Adds rights for one exact schema-qualified principal Pointer. */
	grantPrincipal(
		principal: ACLPrincipal,
		...permissions: readonly ACLPermission[]
	): ACL {
		return updatePrincipalPermissions(
			this,
			principal,
			permissions,
			grantPermissions,
		)
	}

	/** Removes only the supplied rights from one exact principal. */
	revokePrincipal(
		principal: ACLPrincipal,
		...permissions: readonly ACLPermission[]
	): ACL {
		return updatePrincipalPermissions(
			this,
			principal,
			permissions,
			revokePermissions,
		)
	}

	/** Replaces one principal's complete right set; no rights removes the entry. */
	setPrincipalPermissions(
		principal: ACLPrincipal,
		...permissions: readonly ACLPermission[]
	): ACL {
		return updatePrincipalPermissions(
			this,
			principal,
			permissions,
			setPermissions,
		)
	}

	/** Returns a detached readonly snapshot of one principal's rights. */
	permissionsForPrincipal(principal: ACLPrincipal): readonly ACLPermission[] {
		const identity = principalIdentity(principal)

		return snapshotPermissions(
			findPermissions(requireState(this).principals, principalKey(identity)),
		)
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
		role: AccessRoleSubject,
		...permissions: readonly ACLPermission[]
	): ACL {
		return updateRolePermissions(this, role, permissions, grantPermissions)
	}

	/** Removes only the supplied rights from one neutral role subject. */
	revokeRole(
		role: AccessRoleSubject,
		...permissions: readonly ACLPermission[]
	): ACL {
		return updateRolePermissions(this, role, permissions, revokePermissions)
	}

	/** Replaces one role's complete right set; no rights removes the entry. */
	setRolePermissions(
		role: AccessRoleSubject,
		...permissions: readonly ACLPermission[]
	): ACL {
		return updateRolePermissions(this, role, permissions, setPermissions)
	}

	/** Returns a detached readonly snapshot of one role's rights. */
	permissionsForRole(role: AccessRoleSubject): readonly ACLPermission[] {
		const reference = roleIdentity(role)

		return snapshotPermissions(
			findPermissions(requireState(this).roles, roleKey(reference)),
		)
	}

	/** Reports whether one neutral role subject owns one exact right. */
	hasRolePermission(
		role: AccessRoleSubject,
		permission: ACLPermission,
	): boolean {
		return this.permissionsForRole(role).includes(permission)
	}

	/**
	 * Returns one deeply detached canonical JSON snapshot of this ACL.
	 *
	 * @example `const document = acl.toJSON()`
	 */
	toJSON(): ACLJSON {
		const state = requireState(this)

		return createACLJSON({
			authenticated: state.authenticated,
			principals: state.principals.map((entry) =>
				immutableRecord({
					className: entry.subject.className,
					id: entry.subject.id,
					permissions: entry.permissions,
				}),
			),
			public: state.public,
			roles: state.roles.map((entry) =>
				immutableRecord({
					kind: 'role' as const,
					permissions: entry.permissions,
					value: entry.subject.value,
				}),
			),
			version: 1,
		})
	}
}

/** Creates one ACL shell and replaces only its private immutable state. */
const createACL = (state: ACLState): ACL => {
	const acl = new ACL()
	aclStates.set(acl, state)

	return acl
}
