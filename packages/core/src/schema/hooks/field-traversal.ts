import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type { GenericField } from '../fields/base/contract.js'
import { getFieldHookDeclarations } from '../fields/base/definition.js'
import { collectFieldTraversalEntries } from '../fields/traversal.js'
import type { FieldHookDeclarations } from './field-declarations.js'

/** Identifies one exact declared field and its stable nested path. */
export interface FieldHookDeclarationEntry {
	readonly field: GenericField
	readonly hooks: FieldHookDeclarations
	readonly path: readonly string[]
}

const collectDeclaredHooks = (
	fields: Readonly<Record<string, GenericField>>,
): readonly FieldHookDeclarationEntry[] => {
	const entries: FieldHookDeclarationEntry[] = []

	for (const { field, path } of collectFieldTraversalEntries(fields)) {
		const hooks = getFieldHookDeclarations(field)

		if (hooks !== undefined) {
			entries.push(immutableRecord({ field, hooks, path }))
		}
	}

	return immutableArray(entries)
}

/**
 * Collects inline declarations in parent-first depth-first declaration order.
 *
 * Runtime can reverse or stack this stable sequence for child-first after phases
 * without rediscovering fields or duplicating list dimensions as physical paths.
 */
export const collectFieldHookDeclarations = (
	fields: Readonly<Record<string, GenericField>>,
): readonly FieldHookDeclarationEntry[] => collectDeclaredHooks(fields)
