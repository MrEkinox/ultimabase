import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import {
	isACLPermission,
	normalizeACLPermissions,
	type ACLPermission,
} from './acl-contracts.js'

/** Describes one schema-qualified principal entry in the public ACL format. */
export interface ACLPrincipalJSON {
	/** Retains the principal schema independently from its object identifier. */
	readonly className: string
	/** Retains the immutable object identifier inside the declared schema. */
	readonly id: string
	/** Lists the canonical rights granted to this exact principal. */
	readonly permissions: readonly ACLPermission[]
}

/** Describes one provider-neutral role entry in the public ACL format. */
export interface ACLRoleJSON {
	/** Prevents another subject kind from being interpreted as a role. */
	readonly kind: 'role'
	/** Retains the complete stable identity emitted by the role provider. */
	readonly value: string
	/** Lists the canonical rights granted to this exact role. */
	readonly permissions: readonly ACLPermission[]
}

/**
 * Represents the stable detached transport and snapshot format of one ACL.
 *
 * Version `1` always contains every collection, including empty collections.
 */
export interface ACLJSON {
	readonly version: 1
	readonly public: readonly ACLPermission[]
	readonly authenticated: readonly ACLPermission[]
	readonly principals: readonly ACLPrincipalJSON[]
	readonly roles: readonly ACLRoleJSON[]
}

const aclJSONKeys = immutableArray([
	'authenticated',
	'principals',
	'public',
	'roles',
	'version',
])
const principalJSONKeys = immutableArray(['className', 'id', 'permissions'])
const roleJSONKeys = immutableArray(['kind', 'permissions', 'value'])

const compareText = (left: string, right: string): number =>
	left < right ? -1 : left > right ? 1 : 0

/** Rejects missing, additional, symbol, and non-enumerable boundary keys. */
const assertExactKeys = (
	record: Readonly<Record<string, unknown>>,
	expected: readonly string[],
	path: string,
): void => {
	const actual = Reflect.ownKeys(record)

	if (
		actual.length !== expected.length ||
		actual.some((key) => {
			if (typeof key !== 'string' || !expected.includes(key)) {
				return true
			}

			const descriptor = Reflect.getOwnPropertyDescriptor(record, key)

			if (descriptor?.enumerable !== true) return true

			return !('value' in descriptor)
		})
	) {
		throw new TypeError(`${path} contains unknown or missing keys`)
	}
}

/** Validates and canonicalizes one untrusted right array. */
const parsePermissions = (
	value: unknown,
	path: string,
	allowEmpty: boolean,
): readonly ACLPermission[] => {
	if (!isUnknownArray(value)) {
		throw new TypeError(`${path} must be an array`)
	}

	const permissions: ACLPermission[] = []

	for (const [index, permission] of value.entries()) {
		if (!isACLPermission(permission)) {
			throw new TypeError(`${path}[${String(index)}] is not an ACL permission`)
		}

		permissions.push(permission)
	}

	const normalized = normalizeACLPermissions(permissions)

	if (!allowEmpty && normalized.length === 0) {
		throw new TypeError(`${path} must contain at least one ACL permission`)
	}

	return normalized
}

/** Reads one principal entry without resolving its schema or object. */
const parsePrincipalEntry = (
	value: unknown,
	path: string,
): ACLPrincipalJSON => {
	if (!isPlainRecord(value)) {
		throw new TypeError(`${path} must be a plain object`)
	}

	assertExactKeys(value, principalJSONKeys, path)
	assertNonEmptyString(value.className, `${path}.className`)
	assertNonEmptyString(value.id, `${path}.id`)

	return immutableRecord({
		className: value.className,
		id: value.id,
		permissions: parsePermissions(
			value.permissions,
			`${path}.permissions`,
			false,
		),
	})
}

/** Reads one role entry while preserving its complete neutral identity. */
const parseRoleEntry = (value: unknown, path: string): ACLRoleJSON => {
	if (!isPlainRecord(value)) {
		throw new TypeError(`${path} must be a plain object`)
	}

	assertExactKeys(value, roleJSONKeys, path)

	if (value.kind !== 'role') {
		throw new TypeError(`${path}.kind must be "role"`)
	}

	assertNonEmptyString(value.value, `${path}.value`)

	return immutableRecord({
		kind: 'role' as const,
		permissions: parsePermissions(
			value.permissions,
			`${path}.permissions`,
			false,
		),
		value: value.value,
	})
}

/** Unions duplicate entries and sorts principal identities canonically. */
const normalizePrincipalEntries = (
	entries: readonly ACLPrincipalJSON[],
): readonly ACLPrincipalJSON[] => {
	const merged = new Map<
		string,
		Readonly<{
			className: string
			id: string
			permissions: readonly ACLPermission[]
		}>
	>()

	for (const entry of entries) {
		const key = JSON.stringify([entry.className, entry.id])
		const existing = merged.get(key)

		merged.set(
			key,
			immutableRecord({
				className: entry.className,
				id: entry.id,
				permissions: normalizeACLPermissions([
					...(existing?.permissions ?? []),
					...entry.permissions,
				]),
			}),
		)
	}

	return immutableArray(
		[...merged.entries()]
			.sort(([left], [right]) => compareText(left, right))
			.map(([, entry]) =>
				immutableRecord({
					className: entry.className,
					id: entry.id,
					permissions: immutableArray(entry.permissions),
				}),
			),
	)
}

/** Unions duplicate entries and sorts neutral role identities canonically. */
const normalizeRoleEntries = (
	entries: readonly ACLRoleJSON[],
): readonly ACLRoleJSON[] => {
	const merged = new Map<string, readonly ACLPermission[]>()

	for (const entry of entries) {
		merged.set(
			entry.value,
			normalizeACLPermissions([
				...(merged.get(entry.value) ?? []),
				...entry.permissions,
			]),
		)
	}

	return immutableArray(
		[...merged.entries()]
			.sort(([left], [right]) => compareText(left, right))
			.map(([value, permissions]) =>
				immutableRecord({
					kind: 'role' as const,
					permissions: immutableArray(permissions),
					value,
				}),
			),
	)
}

/** Creates one deeply detached canonical document from validated ACL data. */
export const createACLJSON = (input: ACLJSON): ACLJSON =>
	immutableRecord({
		version: 1 as const,
		public: normalizeACLPermissions(input.public),
		authenticated: normalizeACLPermissions(input.authenticated),
		principals: normalizePrincipalEntries(input.principals),
		roles: normalizeRoleEntries(input.roles),
	})

/** Validates one complete untrusted ACL document without performing I/O. */
export const parseACLJSON = (value: unknown): ACLJSON => {
	if (!isPlainRecord(value)) {
		throw new TypeError('ACL JSON must be a plain object')
	}

	assertExactKeys(value, aclJSONKeys, 'ACL JSON')

	if (value.version !== 1) {
		throw new TypeError('ACL JSON version must be 1')
	}

	if (!isUnknownArray(value.principals)) {
		throw new TypeError('ACL JSON principals must be an array')
	}

	if (!isUnknownArray(value.roles)) {
		throw new TypeError('ACL JSON roles must be an array')
	}

	return createACLJSON({
		authenticated: parsePermissions(
			value.authenticated,
			'ACL JSON authenticated',
			true,
		),
		principals: value.principals.map((entry, index) =>
			parsePrincipalEntry(entry, `ACL JSON principals[${String(index)}]`),
		),
		public: parsePermissions(value.public, 'ACL JSON public', true),
		roles: value.roles.map((entry, index) =>
			parseRoleEntry(entry, `ACL JSON roles[${String(index)}]`),
		),
		version: 1,
	})
}
