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

/** Identifies one principal entry; the same key orders entries canonically. */
export const principalEntryKey = (entry: {
	readonly className: string
	readonly id: string
}): string => JSON.stringify([entry.className, entry.id])

/**
 * Unions entries sharing one subject key, rebuilds each entry through `build`,
 * and sorts the result by key so equal ACLs always serialize identically.
 */
const mergeEntries = <
	TEntry extends { readonly permissions: readonly ACLPermission[] },
>(
	entries: readonly TEntry[],
	keyOf: (entry: TEntry) => string,
	build: (entry: TEntry, permissions: readonly ACLPermission[]) => TEntry,
): readonly TEntry[] => {
	const merged = new Map<string, TEntry>()

	for (const entry of entries) {
		const key = keyOf(entry)
		const existing = merged.get(key)?.permissions ?? []
		merged.set(
			key,
			build(
				entry,
				normalizeACLPermissions([...existing, ...entry.permissions]),
			),
		)
	}

	return immutableArray(
		[...merged]
			.sort(([left], [right]) => (left < right ? -1 : 1))
			.map(([, entry]) => entry),
	)
}

/** Creates one deeply detached canonical document from validated ACL data. */
export const createACLJSON = (input: ACLJSON): ACLJSON =>
	immutableRecord({
		version: 1 as const,
		public: normalizeACLPermissions(input.public),
		authenticated: normalizeACLPermissions(input.authenticated),
		principals: mergeEntries(
			input.principals,
			principalEntryKey,
			({ className, id }, permissions) =>
				immutableRecord({ className, id, permissions }),
		),
		roles: mergeEntries(
			input.roles,
			(entry) => entry.value,
			({ value }, permissions) =>
				immutableRecord({ kind: 'role' as const, permissions, value }),
		),
	})

/** Rejects missing, additional, symbol, non-enumerable, and accessor keys. */
const assertExactKeys = (
	record: Readonly<Record<string, unknown>>,
	expected: readonly string[],
	path: string,
): void => {
	const actual = Reflect.ownKeys(record)
	const valid =
		actual.length === expected.length &&
		actual.every((key) => {
			if (typeof key !== 'string' || !expected.includes(key)) return false
			const descriptor = Reflect.getOwnPropertyDescriptor(record, key)
			return descriptor?.enumerable === true && 'value' in descriptor
		})

	if (!valid) throw new TypeError(`${path} contains unknown or missing keys`)
}

/** Validates and canonicalizes one untrusted right array. */
const parsePermissions = (
	value: unknown,
	path: string,
	allowEmpty: boolean,
): readonly ACLPermission[] => {
	if (!isUnknownArray(value)) throw new TypeError(`${path} must be an array`)

	const permissions = value.map((permission, index) => {
		if (!isACLPermission(permission)) {
			throw new TypeError(`${path}[${String(index)}] is not an ACL permission`)
		}
		return permission
	})
	const normalized = normalizeACLPermissions(permissions)

	if (!allowEmpty && normalized.length === 0) {
		throw new TypeError(`${path} must contain at least one ACL permission`)
	}
	return normalized
}

/** Checks that one subject entry is a plain object with exactly `keys`. */
const parseEntry = (
	value: unknown,
	keys: readonly string[],
	path: string,
): Readonly<Record<string, unknown>> => {
	if (!isPlainRecord(value)) {
		throw new TypeError(`${path} must be a plain object`)
	}
	assertExactKeys(value, keys, path)
	return value
}

const parsePrincipalEntry = (
	value: unknown,
	path: string,
): ACLPrincipalJSON => {
	const entry = parseEntry(value, ['className', 'id', 'permissions'], path)
	assertNonEmptyString(entry.className, `${path}.className`)
	assertNonEmptyString(entry.id, `${path}.id`)

	return {
		className: entry.className,
		id: entry.id,
		permissions: parsePermissions(
			entry.permissions,
			`${path}.permissions`,
			false,
		),
	}
}

const parseRoleEntry = (value: unknown, path: string): ACLRoleJSON => {
	const entry = parseEntry(value, ['kind', 'permissions', 'value'], path)
	if (entry.kind !== 'role') throw new TypeError(`${path}.kind must be "role"`)
	assertNonEmptyString(entry.value, `${path}.value`)

	return {
		kind: 'role',
		permissions: parsePermissions(
			entry.permissions,
			`${path}.permissions`,
			false,
		),
		value: entry.value,
	}
}

/** Validates one complete untrusted ACL document without performing I/O. */
export const parseACLJSON = (value: unknown): ACLJSON => {
	if (!isPlainRecord(value)) {
		throw new TypeError('ACL JSON must be a plain object')
	}
	assertExactKeys(
		value,
		['authenticated', 'principals', 'public', 'roles', 'version'],
		'ACL JSON',
	)
	if (value.version !== 1) throw new TypeError('ACL JSON version must be 1')
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
