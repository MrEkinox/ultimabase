import { describe, expect, it } from 'vitest'

import type { OperationKind } from '@ultimabase/core'
import { getHookOperationFamily, getMutationHookKind } from './lifecycle.js'

const families: readonly (readonly [OperationKind, string])[] = [
	['count', 'read'],
	['create-many', 'create'],
	['create-one', 'create'],
	['delete-many', 'delete'],
	['delete-one', 'delete'],
	['exists', 'read'],
	['find-many', 'read'],
	['find-one', 'read'],
	['get', 'read'],
	['update-many', 'update'],
	['update-one', 'update'],
	['upsert-many', 'upsert'],
	['upsert-one', 'upsert'],
]

describe('hook operation families', () => {
	it.each(families)('dispatches %s through the %s branch', (kind, family) => {
		expect(getHookOperationFamily(kind)).toBe(family)
	})

	it('maps normalized mutation terminals to cardinality-free hook kinds', () => {
		expect(getMutationHookKind('create-many')).toBe('create')
		expect(getMutationHookKind('update-one')).toBe('update')
		expect(getMutationHookKind('upsert-many')).toBe('upsert')
		expect(getMutationHookKind('delete-one')).toBe('delete')
		expect(() => getMutationHookKind('find-many')).toThrow(
			'Read terminals do not have a mutation hook kind',
		)
	})
})
