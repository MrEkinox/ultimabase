import { FrameworkError } from '../../foundation.js'
import { createPointer, Pointer } from '../../schema/relations/pointer.js'
import {
	getFieldSchemaTarget,
	Schema,
	type GenericField,
	type SchemaDefinition,
} from '../../schema/index.js'

import type { QueryFieldPath } from './primitive.js'

const readPointerTarget = (
	pointer: GenericField,
	path: string,
): SchemaDefinition => {
	const targetSchema = getFieldSchemaTarget(pointer)?.()

	if (!Schema.is(targetSchema)) {
		throw new TypeError(`${path} requires a registered pointer target`)
	}

	return targetSchema
}

/** Pointer identity operands are target object IDs and become exact Pointers. */
export const normalizePointerIdentityOperand = (
	schema: SchemaDefinition,
	target: string | QueryFieldPath,
	operand: unknown,
	path: string,
): unknown => {
	const pointer =
		typeof target === 'string' ? schema.persistedFields[target] : undefined

	if (pointer?.kind !== 'pointer') return operand

	const targetSchema = readPointerTarget(pointer, path)

	if (typeof operand !== 'string') {
		throw new TypeError(`${path} must be a target object id`)
	}

	return createPointer(targetSchema, operand)
}

/**
 * Reads the equality shorthand of a pointer field (ADR-0307): a Pointer of
 * the declared target stands for its id; another schema's Pointer is a
 * `VALIDATION_ERROR`.
 */
export const readPointerShorthandOperand = (
	pointer: GenericField,
	operand: unknown,
	path: string,
): unknown => {
	if (!Pointer.is(operand)) return operand

	const targetSchema = readPointerTarget(pointer, path)

	if (operand.schema !== targetSchema) {
		throw new FrameworkError(
			'VALIDATION_ERROR',
			`${path} must be a ${targetSchema.className} Pointer or object id`,
			{ publicMessage: 'The filter input is invalid.' },
		)
	}

	return operand.id
}
