import {
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import type { QueryBuiltInFilterOperator } from '../../query/filters/primitive.js'
import { hasListOption } from '../../schema/fields/base/options.js'
import {
	isBuiltInFieldKind,
	type BuiltInFieldKind,
} from '../../schema/fields/base/kinds.js'

/** Selects the filter-operator declaration protocol understood by Core (ADR-0301). */
export const databaseFilterOperatorCapabilityVersion = 1 as const

/**
 * Groups fields whose filters an adapter executes the same way: one built-in
 * field kind, or `list` for any one-dimensional list field.
 */
export type DatabaseFilterOperatorFamily =
	Exclude<BuiltInFieldKind, 'relation'> | 'list'

/**
 * Declares, per built-in field family, the filter discriminants an adapter
 * executes. A missing family or discriminant means unsupported: Core rejects
 * such a filter with `VALIDATION_ERROR` before the adapter is reached.
 *
 * @example `{ kind: 'filter-operators', version: 1, families: { string: ['equal', 'starts-with', 'null'] } }`
 */
export interface DatabaseFilterOperatorCapability {
	readonly kind: 'filter-operators'
	readonly version: typeof databaseFilterOperatorCapabilityVersion
	readonly families: Readonly<
		Partial<
			Record<
				DatabaseFilterOperatorFamily,
				readonly QueryBuiltInFilterOperator[]
			>
		>
	>
}

/** Selects the partial-index protocol understood by Core (ADR-0303). */
export const databasePartialIndexCapabilityVersion = 1 as const

/** Advertises indexes restricted by a portable `where` predicate (ADR-0303). */
export interface DatabasePartialIndexCapability {
	readonly kind: 'partial-indexes'
	readonly version: typeof databasePartialIndexCapabilityVersion
}

/** Reuses one frozen partial-index declaration across adapter lifetimes. */
export const databasePartialIndexCapability: DatabasePartialIndexCapability =
	immutableRecord({
		kind: 'partial-indexes',
		version: databasePartialIndexCapabilityVersion,
	})

/** Reads the operator family of one field; `undefined` for plugin and relation fields. */
export const readDatabaseFilterOperatorFamily = (
	field: Readonly<{ kind: string; options: object }> | undefined,
): DatabaseFilterOperatorFamily | undefined => {
	// An unstructured JSON path targets JSON values.
	if (field === undefined) return 'json'
	if (hasListOption(field.options)) return 'list'
	return isBuiltInFieldKind(field.kind) && field.kind !== 'relation'
		? field.kind
		: undefined
}

/** Reads the declared operators of one family, or none when undeclared. */
export const readDeclaredFilterOperators = (
	capabilities: object | undefined,
	family: DatabaseFilterOperatorFamily,
): readonly string[] => {
	const capability: unknown =
		capabilities === undefined
			? undefined
			: Reflect.get(capabilities, 'filterOperators')
	if (
		!isPlainRecord(capability) ||
		capability.kind !== 'filter-operators' ||
		capability.version !== databaseFilterOperatorCapabilityVersion ||
		!isPlainRecord(capability.families)
	) {
		return []
	}
	const operators: unknown = capability.families[family]
	return isUnknownArray(operators)
		? operators.filter(
				(operator): operator is string => typeof operator === 'string',
			)
		: []
}
