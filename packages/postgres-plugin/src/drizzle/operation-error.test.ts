import { FrameworkError } from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

import { mapPostgresOperationError } from './operation-error.js'

const driverError = (code: string): Error & { readonly code: string } =>
	Object.assign(new Error('secret driver diagnostic'), { code })

describe('PostgreSQL operation errors', () => {
	it('maps data constraints without exposing driver diagnostics publicly', () => {
		const error = mapPostgresOperationError(driverError('23505'), 'create-one')

		expect(error).toMatchObject({
			code: 'VALIDATION_ERROR',
			internalDetails: { driverCode: '23505', operation: 'create-one' },
		})
		expect(error.toJSON()).toStrictEqual({
			code: 'VALIDATION_ERROR',
			message: 'The operation violates a data constraint.',
			retryable: false,
		})
		expect(JSON.stringify(error.toJSON())).not.toContain('secret')
	})

	it('maps explicit no-data and retryable transaction failures', () => {
		expect(
			mapPostgresOperationError(driverError('P0002'), 'get'),
		).toMatchObject({
			code: 'NOT_FOUND',
			retryable: false,
		})
		expect(
			mapPostgresOperationError(driverError('40001'), 'update-one'),
		).toMatchObject({ code: 'INTERNAL_ERROR', retryable: true })
	})

	it('preserves framework failures and sanitizes unknown errors', () => {
		const existing = new FrameworkError('VALIDATION_ERROR', 'Already mapped')

		expect(mapPostgresOperationError(existing, 'find-many')).toBe(existing)
		expect(
			mapPostgresOperationError(new Error('secret'), 'find-many'),
		).toMatchObject({
			code: 'INTERNAL_ERROR',
			internalDetails: { operation: 'find-many' },
		})
	})
})
