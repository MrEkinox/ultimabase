import type { SchemaDefinition } from '../../schema/index.js'
import type {
	SchemaTypeInfoSource,
	SchemaTypeValue,
} from '../../schema/type-info.js'
import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type {
	QueryFieldName,
	QuerySelectedFieldNode,
	QuerySelectionNode,
} from '../ast/contracts.js'
import {
	assertQuerySchemaReference,
	parseQueryFieldName,
} from '../ast/schema.js'
import { assertPlainObject } from '../../exact-object-validation.js'

/**
 * Describes one flat schema projection through literal inclusion or exclusion flags.
 *
 * At least one `true` enables inclusion mode. An object containing only `false`
 * values starts from every schema field and omits the named fields.
 *
 * @example
 * ```ts
 * Post.findMany({ select: { title: true } }) // result contains `id` and `title`
 * Post.findMany({ select: { internalNote: false } })
 * ```
 */
export type QuerySelection<TSchema extends SchemaTypeInfoSource> =
	SchemaTypeValue<TSchema, 'Select'>

type QuerySelectableFieldName<TSchema extends SchemaTypeInfoSource> = Extract<
	keyof QuerySelection<TSchema>,
	string
>

type QuerySelectionKeyWithValue<TSelection, TValue extends boolean> = {
	[TKey in keyof TSelection]-?: [TSelection[TKey]] extends [TValue]
		? TKey
		: never
}[keyof TSelection]

type QueryIncludedSelectionField<
	TSchema extends SchemaTypeInfoSource,
	TSelection,
> = Extract<
	QuerySelectionKeyWithValue<TSelection, true>,
	QuerySelectableFieldName<TSchema>
>

type QueryExcludedSelectionField<
	TSchema extends SchemaTypeInfoSource,
	TSelection,
> = Extract<
	QuerySelectionKeyWithValue<TSelection, false>,
	QuerySelectableFieldName<TSchema>
>

/** Resolves the statically visible field union for one literal selection object. */
export type QuerySelectedField<
	TSchema extends SchemaTypeInfoSource,
	TSelection,
> = Extract<
	keyof TSelection extends never
		? never
		: | ([QueryIncludedSelectionField<TSchema, TSelection>] extends [never]
					? Exclude<
							QuerySelectableFieldName<TSchema>,
							QueryExcludedSelectionField<TSchema, TSelection>
						>
					: QueryIncludedSelectionField<TSchema, TSelection>)
			| Extract<'id', QuerySelectableFieldName<TSchema>>,
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
	TSchema extends SchemaTypeInfoSource,
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

const isRelationFieldName = (
	schema: SchemaDefinition,
	fieldName: string,
): boolean => schema.fields[fieldName]?.kind === 'relation'

/**
 * Returns a field name a projection may select. Relations hold no stored
 * value: they are read through `include`, as source typing already requires.
 */
const parseSelectableFieldName = <TSchema extends SchemaDefinition>(
	schema: TSchema,
	fieldName: unknown,
	path: string,
): QueryFieldName<TSchema> => {
	const field = parseQueryFieldName(schema, fieldName, path)

	if (isRelationFieldName(schema, field)) {
		throw new TypeError(
			`${path} must not reference a relation; read relations through include`,
		)
	}

	return field
}

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
		const selectedFieldName = parseSelectableFieldName(
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

	// Every public model exposes its stable identity independently from the
	// caller's scalar projection. Keeping this invariant in the canonical AST
	// also makes adapters and nested inclusions follow the same rule.
	if (!knownFieldNames.has('id') && Object.hasOwn(schema.fields, 'id')) {
		selectedFields.push(
			immutableRecord({
				kind: 'selected-field',
				field: parseQueryFieldName(schema, 'id', 'selection.id'),
			}),
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

	assertPlainObject(untrustedSelection, 'query selection must be an object')

	const included: QueryFieldName<TSchema>[] = []
	const excluded = new Set<string>()

	for (const [fieldName, selected] of Object.entries(untrustedSelection)) {
		const field = parseSelectableFieldName(
			schema,
			fieldName,
			`selection.${fieldName}`,
		)

		if (typeof selected !== 'boolean') {
			throw new TypeError(`selection.${fieldName} must be a boolean`)
		}

		if (fieldName === 'id' && !selected) {
			throw new TypeError('selection.id cannot be false')
		}

		if (selected) included.push(field)
		else excluded.add(field)
	}

	if (included.length > 0 || excluded.size === 0) {
		return normalizeQuerySelectedFields(schema, included)
	}

	// Exclusion mode starts from every selectable field and omits the named ones.
	const selectedFields = Object.keys(schema.fields)
		.map((fieldName, index) =>
			parseQueryFieldName(schema, fieldName, `schema.fields[${String(index)}]`),
		)
		.filter(
			(fieldName) =>
				!excluded.has(fieldName) && !isRelationFieldName(schema, fieldName),
		)

	if (selectedFields.length === 0) {
		throw new TypeError('query selection must retain at least one field')
	}

	return normalizeQuerySelectedFields(schema, selectedFields)
}
