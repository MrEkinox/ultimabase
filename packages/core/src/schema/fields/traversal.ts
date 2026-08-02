import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import type { GenericField } from './base/contract.js'
import { assertFieldDefinition } from './base/definition.js'

/** Identifies one declared field without flattening its structural path. */
export interface FieldTraversalEntry {
	readonly field: GenericField
	readonly path: readonly string[]
}

const collectFieldEntries = (
	fields: Readonly<Record<string, GenericField>>,
	parentPath: readonly string[],
	entries: FieldTraversalEntry[],
): void => {
	for (const [name, field] of Object.entries(fields)) {
		const path = immutableArray([...parentPath, name])

		entries.push(immutableRecord({ field, path }))

		if (field.kind !== 'object') {
			continue
		}

		const nestedFields: unknown = Reflect.get(field.options, 'fields')

		if (!isPlainRecord(nestedFields)) {
			throw new TypeError(`${path.join('.')} must contain a field map`)
		}

		const declaredNestedFields: Record<string, GenericField> = {}

		for (const [nestedName, nestedField] of Object.entries(nestedFields)) {
			assertFieldDefinition(nestedField, [...path, nestedName].join('.'))
			declaredNestedFields[nestedName] = nestedField
		}

		// List metadata wraps values, but never adds a structural path segment.
		collectFieldEntries(declaredNestedFields, path, entries)
	}
}

/** Collects every field in immutable parent-first depth-first declaration order. */
export const collectFieldTraversalEntries = (
	fields: Readonly<Record<string, GenericField>>,
): readonly FieldTraversalEntry[] => {
	const entries: FieldTraversalEntry[] = []

	collectFieldEntries(fields, immutableArray([]), entries)

	return immutableArray(entries)
}
