import { FrameworkError } from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

import {
	createPostgresTransactionError,
	mapPostgresOperationError,
	type PostgresConstraintLookup,
} from './operation-error.js'

const driverError = (
	code: string,
	constraint?: string,
): Error & { readonly code: string } =>
	Object.assign(new Error('secret driver diagnostic'), {
		code,
		...(constraint === undefined ? {} : { constraint }),
	})

const constraints: PostgresConstraintLookup = (name) =>
	name === 'todos_slug_unique'
		? { kind: 'unique', schema: 'Todo', fields: ['slug'] }
		: name === 'todos_owner_fk'
			? {
					kind: 'reference',
					schema: 'Todo',
					field: 'owner',
					target: 'User',
				}
			: undefined

describe('PostgreSQL operation errors', () => {
	it('maps data constraints without exposing driver diagnostics publicly', () => {
		const error = mapPostgresOperationError(driverError('23502'), 'create-one')

		expect(error).toMatchObject({
			code: 'VALIDATION_ERROR',
			internalDetails: { driverCode: '23502', operation: 'create-one' },
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
	})

	it('maps unique violations to the logical index fields only (ADR-0302)', () => {
		const error = mapPostgresOperationError(
			driverError('23505', 'todos_slug_unique'),
			'create-one',
			{ constraints, schema: 'Todo' },
		)

		expect(error).toMatchObject({
			code: 'UNIQUE_VIOLATION',
			internalDetails: { constraint: 'todos_slug_unique', driverCode: '23505' },
		})
		expect(error.toJSON()).toStrictEqual({
			code: 'UNIQUE_VIOLATION',
			details: { fields: ['slug'], schema: 'Todo' },
			message: 'A Todo with the same slug already exists.',
			retryable: false,
		})
		expect(
			mapPostgresOperationError(driverError('23505'), 'create-one').toJSON(),
		).toStrictEqual({
			code: 'UNIQUE_VIOLATION',
			message: 'The operation would duplicate a unique value.',
			retryable: false,
		})
	})

	it('names only the written or deleted schema in reference violations (ADR-0299)', () => {
		const deletion = mapPostgresOperationError(
			driverError('23503', 'todos_owner_fk'),
			'delete-one',
			{ constraints, schema: 'User' },
		)
		const write = mapPostgresOperationError(
			driverError('23503', 'todos_owner_fk'),
			'update-one',
			{ constraints, schema: 'Todo' },
		)

		expect(deletion).toMatchObject({
			code: 'REFERENCE_VIOLATION',
			internalDetails: {
				referencedSchema: 'User',
				referencingField: 'owner',
				referencingSchema: 'Todo',
			},
		})
		expect(deletion.toJSON()).toStrictEqual({
			code: 'REFERENCE_VIOLATION',
			details: { schema: 'User' },
			message:
				'The User object cannot be deleted while other objects reference it.',
			retryable: false,
		})
		expect(write.toJSON()).toStrictEqual({
			code: 'REFERENCE_VIOLATION',
			details: { schema: 'Todo' },
			message: 'The Todo object references an object that does not exist.',
			retryable: false,
		})
	})

	it('maps serialization failures and deadlocks to retryable conflicts (ADR-0300)', () => {
		for (const code of ['40001', '40P01']) {
			expect(
				mapPostgresOperationError(driverError(code), 'update-one'),
			).toMatchObject({ code: 'TRANSACTION_CONFLICT', retryable: true })
			expect(
				createPostgresTransactionError('commit', driverError(code)),
			).toMatchObject({ code: 'TRANSACTION_CONFLICT', retryable: true })
			expect(
				createPostgresTransactionError('rollback', driverError(code)),
			).toMatchObject({ code: 'TRANSACTION_ERROR', retryable: false })
		}
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
