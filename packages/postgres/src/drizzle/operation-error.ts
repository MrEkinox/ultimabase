import { FrameworkError } from '@ultimabase/core'
import type { OperationKind } from '@ultimabase/core'

import { readPostgresDriverCode } from '../connection/driver-error.js'

const isDeveloperDataError = (code: string): boolean =>
	code.startsWith('22') || code.startsWith('23')

const isFrameworkError = (value: unknown): value is FrameworkError =>
	value instanceof FrameworkError

/** Converts driver failures without exposing SQL, values, or database diagnostics. */
export const mapPostgresOperationError = (
	error: unknown,
	operation: OperationKind,
): FrameworkError => {
	if (isFrameworkError(error)) {
		return error
	}

	const driverCode = readPostgresDriverCode(error)
	const internalDetails = {
		...(driverCode === undefined ? {} : { driverCode }),
		operation,
	}

	if (driverCode === 'P0002') {
		return new FrameworkError('NOT_FOUND', 'PostgreSQL row was not found.', {
			cause: error,
			publicMessage: 'The requested object was not found.',
			internalDetails,
		})
	}

	if (driverCode !== undefined && isDeveloperDataError(driverCode)) {
		return new FrameworkError(
			'VALIDATION_ERROR',
			'PostgreSQL rejected an operation value or constraint.',
			{
				cause: error,
				publicMessage: 'The operation violates a data constraint.',
				internalDetails,
			},
		)
	}

	const retryable = driverCode === '40001' || driverCode === '40P01'

	return new FrameworkError('INTERNAL_ERROR', 'PostgreSQL operation failed.', {
		cause: error,
		publicMessage: 'The database operation failed.',
		internalDetails,
		retryable,
	})
}
