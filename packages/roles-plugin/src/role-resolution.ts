import {
	Pointer,
	type OperationOptions,
	type SchemaClass,
	type SchemaDefinition,
	type SchemaResult,
} from '@ultimabase/core'

import {
	getRoleReferenceState,
	type RoleReference,
	type RoleReferenceState,
	type RoleSelector,
} from './role-reference.js'
import { readPersistedRoleId } from './role-hierarchy.js'

type RoleLookupSchema = SchemaClass

/** Reports strict stored-role lookup failures without leaking adapter details. */
export class RoleReferenceResolutionError extends Error {
	readonly code:
		| 'ROLE_REFERENCE_AMBIGUOUS'
		| 'ROLE_REFERENCE_UNKNOWN'
		| 'ROLE_REFERENCE_UNRECOGNIZED'

	constructor(
		code:
			| 'ROLE_REFERENCE_AMBIGUOUS'
			| 'ROLE_REFERENCE_UNKNOWN'
			| 'ROLE_REFERENCE_UNRECOGNIZED',
		message: string,
	) {
		super(message)
		this.name = 'RoleReferenceResolutionError'
		this.code = code
		Object.freeze(this)
	}
}

const requireRoleReferenceState = <
	const TSchema extends SchemaDefinition,
	const TSelector extends RoleSelector,
>(
	reference: RoleReference<TSchema, TSelector>,
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
	TRole extends { readonly id: { toString(): string } },
>(
	name: string,
	matches: readonly TRole[],
): TRole => {
	if (matches.length === 0) {
		throw new RoleReferenceResolutionError(
			'ROLE_REFERENCE_UNKNOWN',
			`Unknown role name: ${name}`,
		)
	}

	if (matches.length > 1) {
		throw new RoleReferenceResolutionError(
			'ROLE_REFERENCE_AMBIGUOUS',
			`Ambiguous role name: ${name}`,
		)
	}

	const match = matches[0]

	if (match === undefined) {
		// The length guard above protects this branch from sparse adapter values.
		throw new RoleReferenceResolutionError(
			'ROLE_REFERENCE_UNKNOWN',
			`Unknown role name: ${name}`,
		)
	}

	return match
}

const findRoleByName = async <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	name: string,
	options?: OperationOptions,
): Promise<SchemaResult<TSchema>> => {
	const lookupSchema = schema as unknown as RoleLookupSchema
	const matches = await lookupSchema.findMany(
		{ where: { name: { eq: name } }, limit: 2 },
		options,
	)

	return resolveUniqueRoleNameMatch(
		name,
		matches,
	) as unknown as SchemaResult<TSchema>
}

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
	const state = requireRoleReferenceState(reference)

	if ('id' in state.selector) {
		return state.selector.id
	}

	return readPersistedRoleId(
		await findRoleByName(state.schema, state.selector.name, options),
	)
}

/** Resolves one reference to the exact persisted role model in its own domain. */
export const resolveRoleReference = async <
	const TSchema extends SchemaDefinition,
>(
	reference: RoleReference<TSchema>,
	options?: OperationOptions,
): Promise<SchemaResult<TSchema>> => {
	const state = requireRoleReferenceState(reference)

	if ('name' in state.selector) {
		return findRoleByName(state.schema, state.selector.name, options)
	}

	const roleId = state.selector.id
	const role = await new Pointer(state.schema, roleId).findOne(
		undefined,
		options,
	)

	if (role === null) {
		throw new RoleReferenceResolutionError(
			'ROLE_REFERENCE_UNKNOWN',
			`Unknown role id: ${roleId}`,
		)
	}

	// Runtime preserves the exact schema identity; this generic bridge only hides
	// the bootstrap BaseItem branch that TypeScript cannot reduce for TSchema.
	return role as unknown as SchemaResult<TSchema>
}
