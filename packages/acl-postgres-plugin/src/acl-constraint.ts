import {
	aclFieldName,
	aclPermissions,
	aclRowConstraintKind,
	aclRowConstraintVersion,
	type ACLPermission,
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

const payloadKeys = new Set([
	'field',
	'permission',
	'principalClassName',
	'principalId',
	'roleResolutionAvailable',
	'roles',
])

const isACLPermission = (value: unknown): value is ACLPermission =>
	aclPermissions.some((permission) => permission === value)

/** Strictly decodes the portable ACL node before any SQL is constructed. */
export const decodeACLRowConstraintPayload = (
	payload: DatabaseConstraintPayload,
): ACLRowConstraintPayload => {
	if (!isPlainRecord(payload)) {
		throw new TypeError('ACL PostgreSQL constraint payload must be an object')
	}

	const ownKeys = Reflect.ownKeys(payload)
	const invalidKey = ownKeys.find((key) => {
		if (typeof key !== 'string' || !payloadKeys.has(key)) return true

		const descriptor = Reflect.getOwnPropertyDescriptor(payload, key)

		// Accessors and hidden keys must not cross the untrusted payload boundary.
		return descriptor?.enumerable !== true || !('value' in descriptor)
	})

	if (invalidKey !== undefined || ownKeys.length !== payloadKeys.size) {
		throw new TypeError('ACL PostgreSQL constraint payload has invalid keys')
	}

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
