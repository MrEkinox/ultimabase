import type { SchemaDefinition } from '../../schema/index.js'
import {
	immutableArray,
	immutableRecord,
	isUnknownArray,
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

/** Shares the only selection that cannot carry schema-specific field names. */
export const emptyQuerySelection: QuerySelectionNode<never> = immutableRecord({
	kind: 'selection',
	fields: immutableArray([]),
})

/** Deduplicates selected fields in first-declaration order without mutating input. */
export const normalizeQuerySelection = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	fields: readonly QueryFieldName<TSchema>[],
): QuerySelectionNode<QueryFieldName<TSchema>> => {
	const untrustedSchema: unknown = schema
	const untrustedFields: unknown = fields

	assertQuerySchemaReference(untrustedSchema)

	if (!isUnknownArray(untrustedFields)) {
		throw new TypeError('selection fields must be an array')
	}

	if (untrustedFields.length === 0) {
		return emptyQuerySelection
	}

	const selectedFields: QuerySelectedFieldNode<QueryFieldName<TSchema>>[] = []
	const knownFieldNames = new Set<string>()

	for (const [index, fieldName] of untrustedFields.entries()) {
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
