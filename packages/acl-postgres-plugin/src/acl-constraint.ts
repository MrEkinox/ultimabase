import {
	aclFieldName,
	aclPermissions,
	aclReferenceConstraintKind,
	aclReferenceConstraintVersion,
	aclRowConstraintKind,
	aclRowConstraintVersion,
	type ACLPermission,
	type ACLReferenceConstraintPayload,
	type ACLRowConstraintPayload,
} from '@ultimabase/acl-permissions-plugin'
import type { DatabaseConstraintPayload } from '@ultimabase/core'
import {
	postgresConstraintCompiler,
	type PostgresConstraintCompileContext,
	type PostgresConstraintCompilerDefinition,
	type PostgresConstraintPredicate,
} from '@ultimabase/postgres-plugin'
import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

const rowPayloadKeys = new Set([
	'field',
	'permission',
	'principalClassName',
	'principalId',
	'roleResolutionAvailable',
	'roles',
])
const referencePayloadKeys = new Set([
	'field',
	'principalClassName',
	'principalId',
	'role',
	'subjectKind',
])

const isACLPermission = (value: unknown): value is ACLPermission =>
	aclPermissions.some((permission) => permission === value)

/** Rejects missing, additional, hidden, accessor, and symbol payload keys. */
const assertExactPayloadKeys = (
	payload: Readonly<Record<string, unknown>>,
	expected: ReadonlySet<string>,
	label: string,
): void => {
	const ownKeys = Reflect.ownKeys(payload)
	const invalidKey = ownKeys.find((key) => {
		if (typeof key !== 'string' || !expected.has(key)) return true

		const descriptor = Reflect.getOwnPropertyDescriptor(payload, key)

		return descriptor?.enumerable !== true || !('value' in descriptor)
	})

	if (invalidKey !== undefined || ownKeys.length !== expected.size) {
		throw new TypeError(`${label} payload has invalid keys`)
	}
}

/** Strictly decodes the portable ACL node before any SQL is constructed. */
export const decodeACLRowConstraintPayload = (
	payload: DatabaseConstraintPayload,
): ACLRowConstraintPayload => {
	if (!isPlainRecord(payload)) {
		throw new TypeError('ACL PostgreSQL constraint payload must be an object')
	}

	assertExactPayloadKeys(payload, rowPayloadKeys, 'ACL PostgreSQL constraint')

	if (payload.field !== aclFieldName) {
		throw new TypeError('ACL PostgreSQL constraint field must be acl')
	}

	if (!isACLPermission(payload.permission)) {
		throw new TypeError('ACL PostgreSQL constraint permission is invalid')
	}

	let principalClassName: string | null
	let principalId: string | null

	if (payload.principalClassName === null && payload.principalId === null) {
		principalClassName = null
		principalId = null
	} else {
		assertNonEmptyString(
			payload.principalClassName,
			'ACL PostgreSQL principal className',
		)
		assertNonEmptyString(payload.principalId, 'ACL PostgreSQL principal id')
		principalClassName = payload.principalClassName
		principalId = payload.principalId
	}

	if (typeof payload.roleResolutionAvailable !== 'boolean') {
		throw new TypeError(
			'ACL PostgreSQL roleResolutionAvailable must be a boolean',
		)
	}

	if (!isUnknownArray(payload.roles)) {
		throw new TypeError('ACL PostgreSQL roles must be an array')
	}

	const roles = payload.roles.map((role, index) => {
		assertNonEmptyString(role, `ACL PostgreSQL roles[${String(index)}]`)

		return role
	})

	if (new Set(roles).size !== roles.length) {
		throw new TypeError('ACL PostgreSQL roles must not contain duplicates')
	}

	if (!payload.roleResolutionAvailable && roles.length > 0) {
		throw new TypeError(
			'ACL PostgreSQL roles require role resolution availability',
		)
	}

	return immutableRecord({
		field: aclFieldName,
		permission: payload.permission,
		principalClassName,
		principalId,
		roleResolutionAvailable: payload.roleResolutionAvailable,
		roles: immutableArray(roles),
	})
}

/** Strictly decodes one ACL reference lookup before SQL construction. */
export const decodeACLReferenceConstraintPayload = (
	payload: DatabaseConstraintPayload,
): ACLReferenceConstraintPayload => {
	if (!isPlainRecord(payload)) {
		throw new TypeError(
			'ACL PostgreSQL reference constraint payload must be an object',
		)
	}

	assertExactPayloadKeys(
		payload,
		referencePayloadKeys,
		'ACL PostgreSQL reference constraint',
	)

	if (payload.field !== aclFieldName) {
		throw new TypeError('ACL PostgreSQL reference constraint field must be acl')
	}

	if (payload.subjectKind === 'principal') {
		assertNonEmptyString(
			payload.principalClassName,
			'ACL PostgreSQL reference principal className',
		)
		assertNonEmptyString(
			payload.principalId,
			'ACL PostgreSQL reference principal id',
		)

		if (payload.role !== null) {
			throw new TypeError(
				'ACL PostgreSQL principal reference role must be null',
			)
		}

		return immutableRecord({
			field: aclFieldName,
			principalClassName: payload.principalClassName,
			principalId: payload.principalId,
			role: null,
			subjectKind: payload.subjectKind,
		})
	}

	if (payload.subjectKind === 'role') {
		if (payload.principalClassName !== null || payload.principalId !== null) {
			throw new TypeError(
				'ACL PostgreSQL role reference principal identity must be null',
			)
		}

		assertNonEmptyString(payload.role, 'ACL PostgreSQL reference role')

		return immutableRecord({
			field: aclFieldName,
			principalClassName: null,
			principalId: null,
			role: payload.role,
			subjectKind: payload.subjectKind,
		})
	}

	throw new TypeError('ACL PostgreSQL reference subjectKind is invalid')
}

/** Builds one GIN-compatible containment alternative for each accepted subject. */
const compileACLRowConstraint = ({
	anyOf,
	field,
	payload,
	sql,
}: PostgresConstraintCompileContext<ACLRowConstraintPayload>): PostgresConstraintPredicate => {
	const aclColumn = field(payload.field)
	const alternatives: PostgresConstraintPredicate[] = [
		sql`${aclColumn} @> ${{ public: [payload.permission] }}`,
	]

	if (payload.principalClassName !== null && payload.principalId !== null) {
		alternatives.push(
			sql`${aclColumn} @> ${{ authenticated: [payload.permission] }}`,
			sql`${aclColumn} @> ${{
				principals: [
					{
						className: payload.principalClassName,
						id: payload.principalId,
						permissions: [payload.permission],
					},
				],
			}}`,
		)
	}

	for (const role of payload.roles) {
		alternatives.push(
			sql`${aclColumn} @> ${{
				roles: [
					{
						kind: 'role',
						permissions: [payload.permission],
						value: role,
					},
				],
			}}`,
		)
	}

	const [first, ...rest] = alternatives

	if (first === undefined) {
		throw new TypeError('ACL PostgreSQL constraint requires one alternative')
	}

	return anyOf(first, ...rest)
}

/** Builds one GIN-compatible containment predicate for an exact ACL subject. */
const compileACLReferenceConstraint = ({
	field,
	payload,
	sql,
}: PostgresConstraintCompileContext<ACLReferenceConstraintPayload>): PostgresConstraintPredicate => {
	const aclColumn = field(payload.field)

	return payload.subjectKind === 'principal'
		? sql`${aclColumn} @> ${{
				principals: [
					{
						className: payload.principalClassName,
						id: payload.principalId,
					},
				],
			}}`
		: sql`${aclColumn} @> ${{
				roles: [{ kind: 'role', value: payload.role }],
			}}`
}

/** Registers the exact ACL row-node version supported by this integration. */
export const aclPostgresConstraintCompiler: PostgresConstraintCompilerDefinition<
	typeof aclRowConstraintKind,
	typeof aclRowConstraintVersion,
	ACLRowConstraintPayload
> = postgresConstraintCompiler({
	kind: aclRowConstraintKind,
	version: aclRowConstraintVersion,
	decode: decodeACLRowConstraintPayload,
	compile: compileACLRowConstraint,
})

/** Registers the ACL reference-search node used by transactional cleanup. */
export const aclReferencePostgresConstraintCompiler: PostgresConstraintCompilerDefinition<
	typeof aclReferenceConstraintKind,
	typeof aclReferenceConstraintVersion,
	ACLReferenceConstraintPayload
> = postgresConstraintCompiler({
	kind: aclReferenceConstraintKind,
	version: aclReferenceConstraintVersion,
	decode: decodeACLReferenceConstraintPayload,
	compile: compileACLReferenceConstraint,
})
