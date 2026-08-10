import type { SchemaDefinition } from '../../schema/index.js'
import type { SchemaTypeValue } from '../../schema/type-info.js'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import type {
	QueryFieldName,
	QuerySelectedFieldNode,
	QuerySelectionNode,
} from '../ast/contracts.js'
import {
	assertQuerySchemaReference,
	parseQueryFieldName,
} from '../ast/schema.js'

/**
 * Describes one flat schema projection through literal inclusion or exclusion flags.
 *
 * At least one `true` enables inclusion mode. An object containing only `false`
 * values starts from every schema field and omits the named fields.
 *
 * @example
 * ```ts
 * Post.findMany({ select: { id: true, title: true } })
 * Post.findMany({ select: { internalNote: false } })
 * ```
 */
export type QuerySelection<TSchema extends SchemaDefinition> = SchemaTypeValue<
	TSchema,
	'Select'
>

type QuerySelectableFieldName<TSchema extends SchemaDefinition> = Extract<
	keyof QuerySelection<TSchema>,
	string
>

type QuerySelectionKeyWithValue<TSelection, TValue extends boolean> = {
	[TKey in keyof TSelection]-?: [TSelection[TKey]] extends [TValue]
		? TKey
		: never
}[keyof TSelection]

type QueryIncludedSelectionField<
	TSchema extends SchemaDefinition,
	TSelection,
> = Extract<
	QuerySelectionKeyWithValue<TSelection, true>,
	QuerySelectableFieldName<TSchema>
>

type QueryExcludedSelectionField<
	TSchema extends SchemaDefinition,
	TSelection,
> = Extract<
	QuerySelectionKeyWithValue<TSelection, false>,
	QuerySelectableFieldName<TSchema>
>

/** Resolves the statically visible field union for one literal selection object. */
export type QuerySelectedField<
	TSchema extends SchemaDefinition,
	TSelection,
> = Extract<
	keyof TSelection extends never
		? never
		: [QueryIncludedSelectionField<TSchema, TSelection>] extends [never]
			? Exclude<
					QuerySelectableFieldName<TSchema>,
					QueryExcludedSelectionField<TSchema, TSelection>
				>
			: QueryIncludedSelectionField<TSchema, TSelection>,
	QueryFieldName<TSchema>
>

/** Prevents dynamic booleans from producing a falsely exact result projection. */
export type LiteralQuerySelection<TSelection> = {
	readonly [TKey in keyof TSelection]: boolean extends TSelection[TKey]
		? never
		: TSelection[TKey]
}

/** Rejects keys that are not fields of the correlated schema. */
export type ExactQuerySelection<
	TSchema extends SchemaDefinition,
	TSelection,
> = TSelection &
	Readonly<
		Record<Exclude<keyof TSelection, QuerySelectableFieldName<TSchema>>, never>
	>

/** Shares the only selection that cannot carry schema-specific field names. */
export const emptyQuerySelection: QuerySelectionNode<never> = immutableRecord({
	kind: 'selection',
	fields: immutableArray([]),
})

/** Builds one immutable AST selection from already correlated field names. */
export const normalizeQuerySelectedFields = <
	const TSchema extends SchemaDefinition,
>(
	schema: TSchema,
	fields: readonly QueryFieldName<TSchema>[],
): QuerySelectionNode<QueryFieldName<TSchema>> => {
	if (fields.length === 0) {
		return emptyQuerySelection
	}

	const selectedFields: QuerySelectedFieldNode<QueryFieldName<TSchema>>[] = []
	const knownFieldNames = new Set<string>()

	for (const [index, fieldName] of fields.entries()) {
		const selectedFieldName = parseQueryFieldName(
			schema,
			fieldName,
			`selection.fields[${String(index)}]`,
		)

		if (knownFieldNames.has(selectedFieldName)) {
			continue
		}

		knownFieldNames.add(selectedFieldName)
		selectedFields.push(
			immutableRecord({ kind: 'selected-field', field: selectedFieldName }),
		)
	}

	return immutableRecord({
		kind: 'selection',
		fields: immutableArray(selectedFields),
	})
}

/** Normalizes one literal boolean projection without mutating caller-owned input. */
export const normalizeQuerySelection = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	selection: QuerySelection<TSchema>,
): QuerySelectionNode<QueryFieldName<TSchema>> => {
	const untrustedSchema: unknown = schema
	const untrustedSelection: unknown = selection

	assertQuerySchemaReference(untrustedSchema)

	if (!isPlainRecord(untrustedSelection)) {
		throw new TypeError('query selection must be an object')
	}

	const entries = Object.entries(untrustedSelection)

	if (entries.length === 0) {
		return emptyQuerySelection
	}

	const normalizedEntries: {
		readonly field: QueryFieldName<TSchema>
		readonly selected: boolean
	}[] = []

	for (const [fieldName, selected] of entries) {
		const normalizedFieldName = parseQueryFieldName(
			schema,
			fieldName,
			`selection.${fieldName}`,
		)

		if (typeof selected !== 'boolean') {
			throw new TypeError(`selection.${fieldName} must be a boolean`)
		}

		normalizedEntries.push({ field: normalizedFieldName, selected })
	}

	const includedFields = normalizedEntries
		.filter((entry) => entry.selected)
		.map((entry) => entry.field)

	if (includedFields.length > 0) {
		return normalizeQuerySelectedFields(schema, includedFields)
	}

	const excludedFields = new Set(normalizedEntries.map((entry) => entry.field))
	const selectedFields = Object.keys(schema.fields)
		.map((fieldName, index) =>
			parseQueryFieldName(schema, fieldName, `schema.fields[${String(index)}]`),
		)
		.filter((fieldName) => !excludedFields.has(fieldName))

	if (selectedFields.length === 0) {
		throw new TypeError('query selection must retain at least one field')
	}

	return normalizeQuerySelectedFields(schema, selectedFields)
}
