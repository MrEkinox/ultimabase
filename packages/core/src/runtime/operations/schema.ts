import { FrameworkError } from '../../foundation.js'
import { isPlainRecord } from '@ultimabase/shared'

const createInvalidOperationError = (): FrameworkError<'VALIDATION_ERROR'> =>
	new FrameworkError(
		'VALIDATION_ERROR',
		'Operation does not contain a normalized schema node.',
		{ publicMessage: 'The operation is invalid.' },
	)

/** Reads the exact schema identity retained by query-backed and schema-backed ASTs. */
export const getOperationSchema = (operation: unknown): unknown => {
	if (!isPlainRecord(operation)) {
		throw createInvalidOperationError()
	}

	const queryOrOperation: Record<string, unknown> = isPlainRecord(
		operation.query,
	)
		? operation.query
		: operation
	const schemaNode: unknown = queryOrOperation.schema

	if (
		!isPlainRecord(schemaNode) ||
		schemaNode.kind !== 'schema' ||
		!Object.hasOwn(schemaNode, 'definition')
	) {
		throw createInvalidOperationError()
	}

	return schemaNode.definition
}
