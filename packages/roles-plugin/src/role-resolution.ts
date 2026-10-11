import {
	type OperationOptions,
	type RequestRoleReference,
	type SchemaClass,
	type SchemaDefinition,
	type SchemaResult,
} from '@ultimabase/core'

import {
	getRoleReferenceState,
	restoreRoleReferenceState,
	type RoleReference,
	type RoleReferenceState,
} from './role-reference.js'
import { readPersistedRoleId } from './role-hierarchy.js'

/** Reports strict stored-role lookup failures without leaking adapter details. */
export class RoleReferenceResolutionError extends Error {
	constructor(
		readonly code:
			| 'ROLE_REFERENCE_AMBIGUOUS'
			| 'ROLE_REFERENCE_UNKNOWN'
			| 'ROLE_REFERENCE_UNRECOGNIZED',
		message: string,
	) {
		super(message)
		this.name = 'RoleReferenceResolutionError'
		Object.freeze(this)
	}
}

/**
 * Exposes the schema-root Query API of a role schema whose exact type is erased.
 *
 * Every role schema is a `Schema.defineSpecialized` class, so the static Query
 * methods exist at runtime; only the generic `SchemaDefinition` type hides them.
 */
export const roleQuerySchema = (schema: SchemaDefinition): SchemaClass =>
	schema as unknown as SchemaClass

// References read back from stored data (ACL `entries()`) carry no package
// state; they are restored against the role schemas of the initialized
// application (one per realm), the latest declaration of a class name winning.
const registeredRoleSchemas = new Map<string, SchemaDefinition>()

/** Records the role schemas of one application for restored references. */
export const registerRoleSchemas = (
	schemas: readonly SchemaDefinition[],
): void => {
	for (const schema of schemas) {
		registeredRoleSchemas.set(schema.className, schema)
	}
}

const requireRoleReferenceState = (
	reference: RequestRoleReference,
): RoleReferenceState => {
	const state =
		getRoleReferenceState(reference) ??
		restoreRoleReferenceState(reference, new Set(registeredRoleSchemas.values()))

	if (state === undefined) {
		throw new RoleReferenceResolutionError(
			'ROLE_REFERENCE_UNRECOGNIZED',
			'Role reference was not created by a registered RoleSchema',
		)
	}

	return state
}

/** Selects one unique match while treating absent or corrupt storage explicitly. */
export const resolveUniqueRoleNameMatch = <
	TRole extends { readonly id: string },
>(
	name: string,
	matches: readonly TRole[],
): TRole => {
	if (matches.length > 1) {
		throw new RoleReferenceResolutionError(
			'ROLE_REFERENCE_AMBIGUOUS',
			`Ambiguous role name: ${name}`,
		)
	}

	// An empty or sparse adapter result has no first match.
	const [match] = matches

	if (match === undefined) {
		throw new RoleReferenceResolutionError(
			'ROLE_REFERENCE_UNKNOWN',
			`Unknown role name: ${name}`,
		)
	}

	return match
}

/** Reads at most two rows so corrupted ambiguous storage fails closed. */
const findRoleByName = async (
	schema: SchemaDefinition,
	name: string,
	options?: OperationOptions,
): Promise<{ readonly id: string }> =>
	resolveUniqueRoleNameMatch(
		name,
		await roleQuerySchema(schema).findMany(
			{ where: { name: { eq: name } }, take: 2 },
			options,
		),
	)

/**
 * Resolves one schema-qualified reference to its stable stored UUID.
 *
 * UUID references are already stable and perform no name lookup. Name
 * references read at most two rows so corrupted ambiguous storage fails closed.
 */
export const resolveRoleReferenceId = async <
	const TSchema extends SchemaDefinition,
>(
	reference: RoleReference<TSchema>,
	options?: OperationOptions,
): Promise<string> => {
	const { schema, selector } = requireRoleReferenceState(reference)

	if ('id' in selector) return selector.id

	return readPersistedRoleId(
		await findRoleByName(schema, selector.name, options),
	)
}

/**
 * Resolves one reference to the exact persisted role model in its own domain.
 * A role reference read from stored data, such as an ACL `entries()` role,
 * resolves against the role schemas of the initialized application.
 *
 * @example `const { name } = await resolveRoleReference(entry.role, { useMasterKey: true })`
 */
export async function resolveRoleReference<
	const TSchema extends SchemaDefinition,
>(
	reference: RoleReference<TSchema>,
	options?: OperationOptions,
): Promise<SchemaResult<TSchema>>
export async function resolveRoleReference(
	reference: RequestRoleReference,
	options?: OperationOptions,
): Promise<SchemaResult<SchemaDefinition>>
export async function resolveRoleReference(
	reference: RequestRoleReference,
	options?: OperationOptions,
): Promise<SchemaResult<SchemaDefinition>> {
	const { schema, selector } = requireRoleReferenceState(reference)
	let role: object | null

	if ('name' in selector) {
		role = await findRoleByName(schema, selector.name, options)
	} else {
		role = await roleQuerySchema(schema).findOne(
			{ where: { id: selector.id } },
			options,
		)

		if (role === null) {
			throw new RoleReferenceResolutionError(
				'ROLE_REFERENCE_UNKNOWN',
				`Unknown role id: ${selector.id}`,
			)
		}
	}

	// Runtime preserves the exact schema identity; this bridge only hides the
	// bootstrap BaseItem branch that TypeScript cannot reduce for a schema.
	return role as unknown as SchemaResult<SchemaDefinition>
}
