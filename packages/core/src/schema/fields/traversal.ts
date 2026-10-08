import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type { GenericField } from './base/contract.js'
import { assertFieldDefinition } from './base/definition.js'
import { assertPlainObject } from '../../exact-object-validation.js'

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

		assertPlainObject(
			nestedFields,
			`${path.join('.')} must contain a field map`,
		)

		// Entries keep every child name, including `__proto__`, as an own key.
		const declaredNestedFields: Readonly<Record<string, GenericField>> =
			Object.fromEntries(
				Object.entries(nestedFields).map(
					([nestedName, nestedField]): [string, GenericField] => {
						assertFieldDefinition(nestedField, [...path, nestedName].join('.'))
						return [nestedName, nestedField]
					},
				),
			)

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
