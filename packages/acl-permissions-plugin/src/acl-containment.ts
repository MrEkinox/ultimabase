import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { isACLPermission, type ACLPermission } from './acl-contracts.js'

type ACLContainmentPermissionList = readonly [ACLPermission]

/** Represents the exact partial persisted ACL fragments used by private policies. */
export type ACLContainmentOperand =
	| Readonly<{ authenticated: ACLContainmentPermissionList }>
	| Readonly<{ public: ACLContainmentPermissionList }>
	| Readonly<{
			principals: readonly [
				Readonly<{
					className: string
					id: string
					permissions?: ACLContainmentPermissionList
				}>,
			]
	  }>
	| Readonly<{
			roles: readonly [
				Readonly<{
					kind: 'role'
					permissions?: ACLContainmentPermissionList
					value: string
				}>,
			]
	  }>

const hasExactKeys = (
	value: Readonly<Record<string, unknown>>,
	keys: readonly string[],
): boolean =>
	Object.keys(value).length === keys.length &&
	keys.every((key) => Object.hasOwn(value, key))

const snapshotPermissions = (
	value: unknown,
	path: string,
): ACLContainmentPermissionList => {
	const permission: unknown =
		isUnknownArray(value) && value.length === 1 ? value[0] : undefined
	if (!isACLPermission(permission)) {
		throw new TypeError(`${path} must contain one ACL permission`)
	}
	return immutableArray([permission])
}

/** Snapshots only the narrow ACL fragments emitted by official protected policies. */
export const snapshotACLContainmentOperand = (
	value: unknown,
	path: string,
): ACLContainmentOperand => {
	if (!isPlainRecord(value) || Object.keys(value).length !== 1) {
		throw new TypeError(`${path} must contain one ACL fragment`)
	}
	if (Object.hasOwn(value, 'public')) {
		return immutableRecord({
			public: snapshotPermissions(value.public, `${path}.public`),
		})
	}
	if (Object.hasOwn(value, 'authenticated')) {
		return immutableRecord({
			authenticated: snapshotPermissions(
				value.authenticated,
				`${path}.authenticated`,
			),
		})
	}

	const isPrincipal = Object.hasOwn(value, 'principals')
	const collection = isPrincipal
		? value.principals
		: Object.hasOwn(value, 'roles')
			? value.roles
			: undefined
	if (!isUnknownArray(collection) || collection.length !== 1) {
		throw new TypeError(`${path} must contain one ACL subject entry`)
	}
	const [entry] = collection
	if (!isPlainRecord(entry)) {
		throw new TypeError(`${path} ACL subject entry must be an object`)
	}
	const hasPermissions = Object.hasOwn(entry, 'permissions')
	const permissions = hasPermissions
		? {
				permissions: snapshotPermissions(
					entry.permissions,
					`${path}.permissions`,
				),
			}
		: {}

	if (isPrincipal) {
		const keys = ['className', 'id', ...(hasPermissions ? ['permissions'] : [])]
		if (!hasExactKeys(entry, keys)) {
			throw new TypeError(`${path} principal fragment has invalid keys`)
		}
		assertNonEmptyString(entry.className, `${path} principal className`)
		assertNonEmptyString(entry.id, `${path} principal id`)

		return immutableRecord({
			principals: immutableArray([
				immutableRecord({
					className: entry.className,
					id: entry.id,
					...permissions,
				}),
			]),
		})
	}

	const keys = ['kind', 'value', ...(hasPermissions ? ['permissions'] : [])]
	if (entry.kind !== 'role' || !hasExactKeys(entry, keys)) {
		throw new TypeError(`${path} role fragment is invalid`)
	}
	assertNonEmptyString(entry.value, `${path} role value`)

	return immutableRecord({
		roles: immutableArray([
			immutableRecord({
				kind: 'role' as const,
				...permissions,
				value: entry.value,
			}),
		]),
	})
}
