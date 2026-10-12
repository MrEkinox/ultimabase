import {
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import {
	defineCapability,
	type CapabilityToken,
} from '../../plugins/capabilities.js'
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

const isFilterOperatorCapability = (
	value: unknown,
): value is DatabaseFilterOperatorCapability =>
	isPlainRecord(value) &&
	value.kind === 'filter-operators' &&
	value.version === databaseFilterOperatorCapabilityVersion &&
	isPlainRecord(value.families)

/**
 * Publishes a database adapter's filter operators while plugins declare
 * themselves, before any connection exists: a transport compiling its schema
 * reads them during materialization (ADR-0301 decision 5, ADR-0325). A
 * database plugin provides the same declaration as its adapter's
 * `capabilities.filterOperators`.
 *
 * @example `provideCapability(databaseFilterOperatorsCapability, { contributionId: 'operators', value: declaration })`
 */
export const databaseFilterOperatorsCapability: CapabilityToken<
	DatabaseFilterOperatorCapability,
	DatabaseFilterOperatorCapability,
	'ultimabase.database-filter-operators',
	'1.0.0',
	'single',
	'declaration'
> = defineCapability<DatabaseFilterOperatorCapability>()({
	capabilityId: 'ultimabase.database-filter-operators',
	version: '1.0.0',
	cardinality: 'single',
	lifetime: 'declaration',
	compose: ([declaration]) => {
		if (!isFilterOperatorCapability(declaration)) {
			throw new TypeError(
				'Database filter operator declaration must be a version 1 filter-operators capability',
			)
		}
		return declaration
	},
})

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

/** Selects the data-reset protocol understood by Core (ADR-0327). */
export const databaseResetCapabilityVersion = 1 as const

/**
 * Empties every table a database adapter manages for one application (schema
 * rows, relation links and plugin private storage) while keeping the tables,
 * so tests start from no data without synchronizing again (ADR-0327). Core
 * invokes it only through an application harness, never during requests.
 */
export interface DatabaseResetCapability {
	readonly kind: 'reset'
	readonly version: typeof databaseResetCapabilityVersion
	/** Deletes every managed row; identity sequences restart. */
	reset(): Promise<void>
}

const isResetCapability = (value: unknown): value is DatabaseResetCapability =>
	isPlainRecord(value) &&
	value.kind === 'reset' &&
	value.version === databaseResetCapabilityVersion &&
	typeof value.reset === 'function'

/**
 * Publishes a database adapter's data reset for one started application
 * (ADR-0327); a database plugin provides it beside its adapter.
 *
 * @example `provideCapability(databaseResetCapability, { contributionId: 'reset', create: () => ({ value: reset }) })`
 */
export const databaseResetCapability: CapabilityToken<
	DatabaseResetCapability,
	DatabaseResetCapability,
	'ultimabase.database-reset',
	'1.0.0',
	'single',
	'application'
> = defineCapability<DatabaseResetCapability>()({
	capabilityId: 'ultimabase.database-reset',
	version: '1.0.0',
	cardinality: 'single',
	lifetime: 'application',
	compose: ([provider]) => {
		if (!isResetCapability(provider)) {
			throw new TypeError(
				'Database reset must be a version 1 reset capability with a reset() method',
			)
		}
		return provider
	},
})
