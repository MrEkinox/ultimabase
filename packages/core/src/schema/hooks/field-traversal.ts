import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import type { GenericField } from '../fields/base/contract.js'
import {
	assertFieldDefinition,
	getFieldHookDeclarations,
} from '../fields/base/definition.js'
import type { FieldHookDeclarations } from './field-declarations.js'

/** Identifies one exact declared field and its stable nested path. */
export interface FieldHookDeclarationEntry {
	readonly field: GenericField
	readonly hooks: FieldHookDeclarations
	readonly path: readonly string[]
}

const collectDeclaredHooks = (
	fields: Readonly<Record<string, GenericField>>,
	parentPath: readonly string[],
	entries: FieldHookDeclarationEntry[],
): void => {
	for (const [name, field] of Object.entries(fields)) {
		const path = immutableArray([...parentPath, name])
		const hooks = getFieldHookDeclarations(field)

		if (hooks !== undefined) {
			entries.push(immutableRecord({ field, hooks, path }))
		}

		if (field.kind !== 'object' || !('fields' in field.options)) {
			continue
		}

		const nestedFields: unknown = field.options.fields

		if (!isPlainRecord(nestedFields)) {
			throw new TypeError(`${path.join('.')} must contain a field map`)
		}

		const declaredNestedFields: Record<string, GenericField> = {}

		for (const [nestedName, nestedField] of Object.entries(nestedFields)) {
			assertFieldDefinition(nestedField, [...path, nestedName].join('.'))
			declaredNestedFields[nestedName] = nestedField
		}

		collectDeclaredHooks(declaredNestedFields, path, entries)
	}
}

/**
 * Collects inline declarations in parent-first depth-first declaration order.
 *
 * Runtime can reverse or stack this stable sequence for child-first after phases
 * without rediscovering fields or duplicating list dimensions as physical paths.
 */
export const collectFieldHookDeclarations = (
	fields: Readonly<Record<string, GenericField>>,
): readonly FieldHookDeclarationEntry[] => {
	const entries: FieldHookDeclarationEntry[] = []

	collectDeclaredHooks(fields, immutableArray([]), entries)

	return immutableArray(entries)
}
