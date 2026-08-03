import type { FieldAccess } from './contracts.js'
import {
	normalizeAccessRule,
	normalizeAccessRuleOrRequiredMap,
	type NormalizedAccessRule,
	type NormalizedRequiredAccessRuleMap,
} from './normalization.js'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'
import type { GenericField } from '../fields/base/contract.js'

/** Lists field capabilities once so declaration validation stays exhaustive. */
export const fieldAccessCapabilities = ['read', 'create', 'update'] as const
export const fieldReadAccessChannels = ['item', 'filter', 'order'] as const

/** Identifies every inline field Access capability. */
export type FieldAccessCapability = (typeof fieldAccessCapabilities)[number]
export type FieldReadAccessChannel = (typeof fieldReadAccessChannels)[number]

/** Retains only validated field rules inside private field capabilities. */
export interface FieldAccessDeclarations {
	readonly read?:
		| NormalizedAccessRule
		| NormalizedRequiredAccessRuleMap<FieldReadAccessChannel>
	readonly create?: NormalizedAccessRule
	readonly update?: NormalizedAccessRule
}

/** Copies and validates one inline declaration without executing policy code. */
export const normalizeFieldAccessDeclarations = (
	access: unknown,
): FieldAccessDeclarations | undefined => {
	if (access === undefined) {
		return undefined
	}

	if (!isPlainRecord(access)) {
		throw new TypeError('access must be a plain object')
	}

	const allowedCapabilities = new Set<string>(fieldAccessCapabilities)
	const declarations: {
		-readonly [
			TKey in keyof FieldAccessDeclarations
		]?: FieldAccessDeclarations[TKey]
	} = {}

	for (const key of Reflect.ownKeys(access)) {
		if (typeof key !== 'string') {
			throw new TypeError('access contains an unsupported symbol key')
		}

		if (!allowedCapabilities.has(key)) {
			throw new TypeError(`Unknown Access rule: access.${key}`)
		}

		if (key === 'read') {
			declarations.read = normalizeAccessRuleOrRequiredMap(
				access[key],
				fieldReadAccessChannels,
				'access.read',
			)
			continue
		}

		const capability = key as Exclude<FieldAccessCapability, 'read'>
		declarations[capability] = normalizeAccessRule(access[key], `access.${key}`)
	}

	return Reflect.ownKeys(declarations).length === 0
		? undefined
		: immutableRecord(declarations)
}

/** Keeps the public field type tied to its normalized private declaration. */
export const declareFieldAccess = <TField extends GenericField>(
	access: FieldAccess<TField> | undefined,
): FieldAccessDeclarations | undefined =>
	normalizeFieldAccessDeclarations(access)
