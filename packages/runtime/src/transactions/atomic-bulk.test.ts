import { FrameworkError } from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

import type { DatabaseOperationAst } from '../database/contracts.js'
import { requiresAtomicBulkTransaction } from './atomic-bulk.js'

describe('automatic bulk transactions', () => {
	it('selects only atomic ordered bulk operation kinds', () => {
		expect(
			requiresAtomicBulkTransaction({
				kind: 'create-many',
				options: { atomic: true },
			} as DatabaseOperationAst),
		).toBe(true)
		expect(
			requiresAtomicBulkTransaction({
				kind: 'upsert-many',
				options: { atomic: false },
			} as DatabaseOperationAst),
		).toBe(false)
		expect(requiresAtomicBulkTransaction({ kind: 'update-many' })).toBe(false)
	})

	it('rejects malformed low-level bulk options before execution', () => {
		const malformed = [
			{ kind: 'create-many' },
			{ kind: 'create-many', options: null },
			{ kind: 'create-many', options: { atomic: 'yes' } },
			{ kind: 'create-many', options: { atomic: true, extra: true } },
		] as const

		for (const operation of malformed) {
			expect(() =>
				requiresAtomicBulkTransaction(operation as DatabaseOperationAst),
			).toThrow(
				new FrameworkError(
					'VALIDATION_ERROR',
					'Atomic bulk operation does not contain normalized options.',
					{ publicMessage: 'The operation is invalid.' },
				),
			)
		}
	})
})
