import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import {
	forEachKnownKey,
	isAccessRule,
	isRuleCallback,
	normalizeRequiredAccessRuleMap,
	type NormalizedAccessRule,
	type NormalizedRequiredAccessRuleMap,
} from './declarations.js'

export const fieldReadAccessChannels = ['item', 'filter', 'order'] as const
export const fieldWriteAccessTransitions = ['fill', 'replace', 'clear'] as const
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

const publicFieldReadAccessChannels = ['output', 'where', 'orderBy'] as const
const fieldAccessCapabilities = new Set(['read', 'write'])

/** Copies and validates one inline declaration without executing policy code. */
export const normalizeFieldAccessDeclarations = (
	access: unknown,
): FieldAccessDeclarations | undefined => {
	if (access === undefined) return undefined
	if (!isPlainRecord(access)) {
		throw new TypeError('access must be a plain object')
	}

	const declarations: {
		-readonly [
			TKey in keyof FieldAccessDeclarations
		]?: FieldAccessDeclarations[TKey]
	} = {}
	forEachKnownKey(access, 'access', fieldAccessCapabilities, (key) => {
		const value = access[key]
		if (key === 'read') {
			if (isAccessRule(value)) {
				declarations.read = value
				return
			}
			const read = normalizeRequiredAccessRuleMap(
				value,
				publicFieldReadAccessChannels,
				'access.read',
			)
			declarations.read = immutableRecord({
				filter: read.where,
				item: read.output,
				order: read.orderBy,
			})
		} else if (isRuleCallback(value)) {
			// A write callback is only meaningful as a relation edge decision.
			declarations.relationWrite = value
		} else if (typeof value === 'boolean') {
			declarations.write = immutableRecord({
				clear: value,
				fill: value,
				replace: value,
			})
			declarations.relationWrite = value
		} else {
			declarations.write = normalizeRequiredAccessRuleMap(
				value,
				fieldWriteAccessTransitions,
				'access.write',
			)
		}
	})

	return Object.keys(declarations).length === 0
		? undefined
		: immutableRecord(declarations)
}
