import {
	normalizeAccessRule,
	normalizeRequiredAccessRuleMap,
	type NormalizedAccessRule,
	type NormalizedRequiredAccessRuleMap,
} from './normalization.js'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

/** Lists field capabilities once so declaration validation stays exhaustive. */
export const fieldAccessCapabilities = ['read', 'write'] as const
export const fieldReadAccessChannels = ['item', 'filter', 'order'] as const
export const fieldWriteAccessTransitions = ['fill', 'replace', 'clear'] as const
const publicFieldReadAccessChannels = ['output', 'where', 'orderBy'] as const

/** Names the private channels for field-level read and write rules. */
export type FieldReadAccessChannel = (typeof fieldReadAccessChannels)[number]
export type FieldWriteAccessTransition =
	(typeof fieldWriteAccessTransitions)[number]

/** Retains only validated field rules inside private field capabilities. */
export interface FieldAccessDeclarations {
	readonly read?:
		| NormalizedAccessRule
		| NormalizedRequiredAccessRuleMap<FieldReadAccessChannel>
	readonly write?: NormalizedRequiredAccessRuleMap<FieldWriteAccessTransition>
	readonly relationWrite?: NormalizedAccessRule
}

const normalizeFieldWriteAccess = (
	write: unknown,
): NormalizedRequiredAccessRuleMap<FieldWriteAccessTransition> => {
	if (typeof write === 'boolean') {
		return immutableRecord({
			clear: write,
			fill: write,
			replace: write,
		})
	}

	if (typeof write === 'function') {
		throw new TypeError(
			'access.write must be a boolean or complete fill/replace/clear object',
		)
	}

	return normalizeRequiredAccessRuleMap(
		write,
		fieldWriteAccessTransitions,
		'access.write',
	)
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
			const read = access[key]

			if (typeof read === 'boolean' || typeof read === 'function') {
				declarations.read = normalizeAccessRule(read, 'access.read')
				continue
			}

			const publicRead = normalizeRequiredAccessRuleMap(
				read,
				publicFieldReadAccessChannels,
				'access.read',
			)
			declarations.read = immutableRecord({
				filter: publicRead.where,
				item: publicRead.output,
				order: publicRead.orderBy,
			})
			continue
		}

		const write = access[key]
		if (typeof write === 'function') {
			declarations.relationWrite = normalizeAccessRule(write, 'access.write')
		} else {
			declarations.write = normalizeFieldWriteAccess(write)
			if (typeof write === 'boolean') {
				declarations.relationWrite = write
			}
		}
	}

	return Reflect.ownKeys(declarations).length === 0
		? undefined
		: immutableRecord(declarations)
}
