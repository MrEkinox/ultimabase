import type { FieldAccess } from './contracts.js'
import {
	normalizeAccessRule,
	normalizeRequiredAccessRuleMap,
	type NormalizedAccessRule,
	type NormalizedRequiredAccessRuleMap,
} from './normalization.js'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'
import type { GenericField } from '../fields/base/contract.js'

/** Lists field capabilities once so declaration validation stays exhaustive. */
export const fieldAccessCapabilities = ['read', 'write'] as const
export const fieldReadAccessChannels = ['item', 'filter', 'order'] as const
export const fieldUpdateAccessTransitions = [
	'fill',
	'replace',
	'clear',
] as const
const publicFieldReadAccessChannels = ['output', 'where', 'orderBy'] as const
const fieldWriteAccessBranches = ['create', 'update'] as const

/** Identifies every inline field Access capability. */
export type FieldAccessCapability = (typeof fieldAccessCapabilities)[number]
export type FieldReadAccessChannel = (typeof fieldReadAccessChannels)[number]
export type FieldUpdateAccessTransition =
	(typeof fieldUpdateAccessTransitions)[number]

/** Retains only validated field rules inside private field capabilities. */
export interface FieldAccessDeclarations {
	readonly read?:
		| NormalizedAccessRule
		| NormalizedRequiredAccessRuleMap<FieldReadAccessChannel>
	readonly create?: NormalizedAccessRule
	readonly update?: NormalizedRequiredAccessRuleMap<FieldUpdateAccessTransition>
	readonly relationWrite?: NormalizedAccessRule
}

const normalizeFieldUpdateAccess = (
	update: unknown,
): NormalizedRequiredAccessRuleMap<FieldUpdateAccessTransition> => {
	if (typeof update === 'boolean') {
		return immutableRecord({
			clear: update,
			fill: update,
			replace: update,
		})
	}

	if (typeof update === 'function') {
		throw new TypeError(
			'access.write.update must be a boolean or complete fill/replace/clear object',
		)
	}

	return normalizeRequiredAccessRuleMap(
		update,
		fieldUpdateAccessTransitions,
		'access.write.update',
	)
}

const normalizeFieldWriteAccess = (
	write: unknown,
): Readonly<{
	create: NormalizedAccessRule
	update: NormalizedRequiredAccessRuleMap<FieldUpdateAccessTransition>
}> => {
	if (typeof write === 'boolean') {
		return immutableRecord({
			create: write,
			update: normalizeFieldUpdateAccess(write),
		})
	}

	if (typeof write === 'function') {
		throw new TypeError(
			'access.write must be a boolean or complete create/update object',
		)
	}

	if (!isPlainRecord(write)) {
		throw new TypeError('access.write must be a plain object')
	}

	const allowedBranches = new Set<string>(fieldWriteAccessBranches)

	for (const key of Reflect.ownKeys(write)) {
		if (typeof key !== 'string') {
			throw new TypeError('access.write contains an unsupported symbol key')
		}

		if (!allowedBranches.has(key)) {
			throw new TypeError(`Unknown Access rule: access.write.${key}`)
		}
	}

	for (const branch of fieldWriteAccessBranches) {
		if (!Object.hasOwn(write, branch)) {
			throw new TypeError(`access.write.${branch} is required`)
		}
	}

	return immutableRecord({
		create: normalizeAccessRule(write.create, 'access.write.create'),
		update: normalizeFieldUpdateAccess(write.update),
	})
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

			if (typeof read === 'boolean') {
				declarations.read = read
				continue
			}

			if (typeof read === 'function') {
				throw new TypeError(
					'access.read must be a boolean or complete output/where/orderBy object',
				)
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

		const write = normalizeFieldWriteAccess(access[key])
		declarations.create = write.create
		declarations.update = write.update
	}

	return Reflect.ownKeys(declarations).length === 0
		? undefined
		: immutableRecord(declarations)
}

/** Normalizes handle-only relation rules into the private field plan channels. */
export const normalizeRelationFieldAccessDeclarations = (
	access: unknown,
): FieldAccessDeclarations | undefined => {
	if (access === undefined) {
		return undefined
	}

	if (!isPlainRecord(access)) {
		throw new TypeError('access must be a plain object')
	}

	const allowedCapabilities = new Set(['read', 'write'])
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
			throw new TypeError(`Unknown relation Access rule: access.${key}`)
		}

		const rule = normalizeAccessRule(access[key], `access.${key}`)

		if (key === 'read') {
			declarations.read = immutableRecord({
				filter: rule,
				item: rule,
				order: rule,
			})
		} else {
			declarations.relationWrite = rule
		}
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
