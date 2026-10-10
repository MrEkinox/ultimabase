import {
	Schema,
	type OperationOptions,
	type SchemaClass,
	type SchemaDefinition,
	type SchemaResult,
} from '@ultimabase/core'

import {
	getRoleReferenceState,
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

const requireRoleReferenceState = <const TSchema extends SchemaDefinition>(
	reference: RoleReference<TSchema>,
): RoleReferenceState<TSchema> => {
	const state = getRoleReferenceState(reference)

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

/** Resolves one reference to the exact persisted role model in its own domain. */
export const resolveRoleReference = async <
	const TSchema extends SchemaDefinition,
>(
	reference: RoleReference<TSchema>,
	options?: OperationOptions,
): Promise<SchemaResult<TSchema>> => {
	const { schema, selector } = requireRoleReferenceState(reference)
	let role: object | null

	if ('name' in selector) {
		role = await findRoleByName(schema, selector.name, options)
	} else {
		// Its schema creates every Pointer (ADR-0314).
		if (!Schema.is(schema)) {
			throw new TypeError('Role resolution requires a role schema')
		}
		role = await schema.pointer(selector.id).findOne(undefined, options)

		if (role === null) {
			throw new RoleReferenceResolutionError(
				'ROLE_REFERENCE_UNKNOWN',
				`Unknown role id: ${selector.id}`,
			)
		}
	}

	// Runtime preserves the exact schema identity; this generic bridge only hides
	// the bootstrap BaseItem branch that TypeScript cannot reduce for TSchema.
	return role as unknown as SchemaResult<TSchema>
}
