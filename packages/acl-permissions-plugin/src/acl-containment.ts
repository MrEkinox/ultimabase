import {
	assertNonEmptyString,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { aclPermissions, type ACLPermission } from './acl-contracts.js'

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
	if (
		!isUnknownArray(value) ||
		value.length !== 1 ||
		!aclPermissions.some((permission) => permission === value[0])
	) {
		throw new TypeError(`${path} must contain one ACL permission`)
	}

	return Object.freeze([value[0]]) as ACLContainmentPermissionList
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

	const collection = Object.hasOwn(value, 'principals')
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
	const permissions = Object.hasOwn(entry, 'permissions')
		? snapshotPermissions(entry.permissions, `${path}.permissions`)
		: undefined

	if (Object.hasOwn(value, 'principals')) {
		if (
			!hasExactKeys(
				entry,
				permissions === undefined
					? ['className', 'id']
					: ['className', 'id', 'permissions'],
			)
		) {
			throw new TypeError(`${path} principal fragment has invalid keys`)
		}
		assertNonEmptyString(entry.className, `${path} principal className`)
		assertNonEmptyString(entry.id, `${path} principal id`)

		const principals = Object.freeze([
			immutableRecord({
				className: entry.className,
				id: entry.id,
				...(permissions === undefined ? {} : { permissions }),
			}),
		]) as readonly [
			Readonly<{
				className: string
				id: string
				permissions?: ACLContainmentPermissionList
			}>,
		]
		return immutableRecord({ principals })
	}

	if (
		entry.kind !== 'role' ||
		!hasExactKeys(
			entry,
			permissions === undefined
				? ['kind', 'value']
				: ['kind', 'permissions', 'value'],
		)
	) {
		throw new TypeError(`${path} role fragment is invalid`)
	}
	assertNonEmptyString(entry.value, `${path} role value`)

	const roles = Object.freeze([
		immutableRecord({
			kind: 'role' as const,
			...(permissions === undefined ? {} : { permissions }),
			value: entry.value,
		}),
	]) as readonly [
		Readonly<{
			kind: 'role'
			permissions?: ACLContainmentPermissionList
			value: string
		}>,
	]
	return immutableRecord({ roles })
}
