import type { PointerValue } from '@ultimabase/core'
import { immutableArray } from '@ultimabase/shared'

/** Names every object-level right understood by the ACL provider. */
export type ACLPermission = 'delete' | 'manageAcl' | 'read' | 'update'

/** Accepts an exact Core Pointer while erasing schema details ACL never reads. */
export type ACLPrincipal = PointerValue

/** Exposes the canonical right order used by immutable ACL snapshots. */
export const aclPermissions: readonly ACLPermission[] = immutableArray([
	'read',
	'update',
	'delete',
	'manageAcl',
])

const permissionSet: ReadonlySet<string> = new Set(aclPermissions)

/** Narrows untrusted JSON values to the closed ACL right vocabulary. */
export const isACLPermission = (value: unknown): value is ACLPermission =>
	typeof value === 'string' && permissionSet.has(value)

/** Canonicalizes one trusted or parsed permission list at the shared boundary. */
export const normalizeACLPermissions = (
	permissions: readonly ACLPermission[],
): readonly ACLPermission[] => {
	for (const permission of permissions) {
		if (!permissionSet.has(permission)) {
			throw new TypeError(`Unknown ACL permission: ${String(permission)}`)
		}
	}

	// Filtering the fixed list removes duplicates and makes call order irrelevant.
	return immutableArray(
		aclPermissions.filter((permission) => permissions.includes(permission)),
	)
}
