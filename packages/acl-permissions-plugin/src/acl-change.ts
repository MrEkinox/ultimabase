import { Pointer } from '@ultimabase/core'
import {
	immutableArray,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { ACL } from './acl.js'
import {
	expandACLPermissions,
	isACLPermission,
	type ACLPermission,
	type ACLPermissionInput,
	type ACLPrincipal,
} from './acl-contracts.js'

/**
 * Shares a row with one principal in an update, without reading its ACL
 * first: `data: { acl: { grant: { principal, permissions: ['read'] } } }`
 * (ADR-0321).
 */
export interface ACLGrantInput {
	readonly grant: Readonly<{
		/** The user, or any Pointer, that gains the rights. */
		principal: ACLPrincipal
		/** The rights added; `'write'` means `update` and `delete`. */
		permissions: readonly ACLPermissionInput[]
	}>
}

/**
 * Stops sharing a row with one principal in an update:
 * `data: { acl: { revoke: { principal } } }` (ADR-0321).
 */
export interface ACLRevokeInput {
	readonly revoke: Readonly<{
		/** The user, or any Pointer, that loses the rights. */
		principal: ACLPrincipal
		/** The rights removed; omitted, every right of the principal. */
		permissions?: readonly ACLPermissionInput[]
	}>
}

/** The ACL changes an update accepts besides a complete ACL. */
export type ACLChangeInput = ACLGrantInput | ACLRevokeInput

/** One validated `grant` or `revoke`, applied to the locked current ACL. */
export class ACLChange {
	readonly kind: 'grant' | 'revoke'
	readonly principal: ACLPrincipal
	/** `undefined` for a revoke of every right. */
	readonly permissions: readonly ACLPermission[] | undefined

	constructor(
		kind: 'grant' | 'revoke',
		principal: ACLPrincipal,
		permissions: readonly ACLPermission[] | undefined,
	) {
		this.kind = kind
		this.principal = principal
		this.permissions = permissions
		Object.freeze(this)
	}

	/** Returns `current` with this change applied. */
	applyTo(current: ACL): ACL {
		if (this.kind === 'grant') {
			return current.grantPrincipal(this.principal, ...(this.permissions ?? []))
		}
		return this.permissions === undefined
			? current.setPrincipalPermissions(this.principal)
			: current.revokePrincipal(this.principal, ...this.permissions)
	}
}

const readPermissions = (
	value: unknown,
	path: string,
): readonly ACLPermission[] => {
	if (!isUnknownArray(value)) {
		throw new TypeError(`${path} must list ACL permissions`)
	}
	return expandACLPermissions(
		immutableArray(
			value.map((permission): ACLPermissionInput => {
				if (permission !== 'write' && !isACLPermission(permission)) {
					throw new TypeError(`${path} must list ACL permissions`)
				}
				return permission
			}),
		),
	)
}

const readChange = (
	kind: 'grant' | 'revoke',
	value: unknown,
	path: string,
): ACLChange => {
	if (!isPlainRecord(value)) {
		throw new TypeError(`${path}.${kind} must be an object`)
	}
	const unknownKey = Object.keys(value).find(
		(key) => key !== 'permissions' && key !== 'principal',
	)
	if (unknownKey !== undefined) {
		throw new TypeError(`Unknown ${path}.${kind} key: ${unknownKey}`)
	}
	const { principal } = value
	if (!Pointer.is(principal)) {
		throw new TypeError(`${path}.${kind}.principal must be a Pointer`)
	}
	if (kind === 'grant' || value.permissions !== undefined) {
		const permissions = readPermissions(
			value.permissions,
			`${path}.${kind}.permissions`,
		)
		if (kind === 'grant' && permissions.length === 0) {
			throw new TypeError(`${path}.grant.permissions must not be empty`)
		}
		return new ACLChange(kind, principal, permissions)
	}
	return new ACLChange(kind, principal, undefined)
}

/**
 * Snapshots one value of `data.acl` in an update: a complete ACL, or one
 * `{ grant }` / `{ revoke }` turned into an `ACLChange`.
 */
export const snapshotACLUpdateInput = (
	value: unknown,
	path: string,
): ACL | ACLChange => {
	if (value instanceof ACL || value instanceof ACLChange) return value
	if (isPlainRecord(value)) {
		const keys = Object.keys(value)
		if (keys.length === 1 && (keys[0] === 'grant' || keys[0] === 'revoke')) {
			const [kind] = keys
			return readChange(kind, value[kind], path)
		}
	}
	throw new TypeError(
		`${path} must be an ACL, { grant: { principal, permissions } } or { revoke: { principal } }`,
	)
}

/** Recognizes a `grant`/`revoke` update value, parsed or not yet parsed. */
export const isACLChangeValue = (value: unknown): boolean => {
	if (value instanceof ACLChange) return true
	if (!isPlainRecord(value)) return false
	const keys = Object.keys(value)
	return keys.length === 1 && (keys[0] === 'grant' || keys[0] === 'revoke')
}
