import type { FieldAccess } from './contracts.js'
import {
	normalizeAccessRuleMap,
	type NormalizedAccessRuleMap,
} from './normalization.js'
import type { GenericField } from '../fields/base/contract.js'

/** Lists field capabilities once so declaration validation stays exhaustive. */
export const fieldAccessCapabilities = [
	'read',
	'filter',
	'order',
	'create',
	'update',
] as const

/** Identifies every inline field Access capability. */
export type FieldAccessCapability = (typeof fieldAccessCapabilities)[number]

/** Retains only validated field rules inside private field capabilities. */
export type FieldAccessDeclarations =
	NormalizedAccessRuleMap<FieldAccessCapability>

/** Copies and validates one inline declaration without executing policy code. */
export const normalizeFieldAccessDeclarations = (
	access: unknown,
): FieldAccessDeclarations | undefined => {
	if (access === undefined) {
		return undefined
	}

	return normalizeAccessRuleMap(access, fieldAccessCapabilities, 'access')
}

/** Keeps the public field type tied to its normalized private declaration. */
export const declareFieldAccess = <TField extends GenericField>(
	access: FieldAccess<TField> | undefined,
): FieldAccessDeclarations | undefined =>
	normalizeFieldAccessDeclarations(access)
