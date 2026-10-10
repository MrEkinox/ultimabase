import {
	immutableArray,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import type {
	OperationResult,
	OperationAstNode,
	OperationKind,
} from '../../query/index.js'
import { Schema, type SchemaDefinition } from '../../schema/index.js'
import { materializeSchemaModel } from '../../schema/schema/model-materialization.js'
import type { RuntimeOperationResult } from '../pipeline/contracts.js'
import { getOperationSchema } from './schema.js'
import {
	isCollectionOperationResult,
	isNullableOperationResult,
	isRecordOperationResult,
} from './characteristics.js'
import {
	createInclusionOperation,
	readInclusions,
} from '../relations/inclusion.js'
import { assertPlainObject } from '../../exact-object-validation.js'

const readOperationSchema = (operation: OperationAstNode): SchemaDefinition => {
	const schema = getOperationSchema(operation)

	if (!Schema.is(schema)) {
		throw new TypeError(
			'Runtime result references an invalid schema model class',
		)
	}

	return schema
}

const materializeRecord = (
	schema: SchemaDefinition,
	value: unknown,
	path: string,
	operation?: OperationAstNode & { readonly kind: OperationKind },
): object => {
	assertPlainObject(value, `${path} must be a plain logical record`)
	let values = value

	if (operation !== undefined) {
		const hydrated: Record<string, unknown> = { ...value }

		for (const inclusion of readInclusions(operation)) {
			const target: unknown = value[inclusion.field]
			const targetOperation = createInclusionOperation(inclusion)
			const targetSchema = readOperationSchema(targetOperation)

			if (inclusion.kind === 'pointer') {
				if (!isPlainRecord(target)) continue

				hydrated[inclusion.field] = materializeRecord(
					targetSchema,
					target,
					`${path}.${inclusion.field}`,
					targetOperation,
				)
				continue
			}

			if (!isUnknownArray(target)) continue

			hydrated[inclusion.field] = immutableArray(
				target.map((record, index) =>
					materializeRecord(
						targetSchema,
						record,
						`${path}.${inclusion.field}[${String(index)}]`,
						targetOperation,
					),
				),
			)
		}

		values = hydrated
	}

	return materializeSchemaModel(schema, values)
}

/** Freezes plain result objects only after Runtime finishes result behaviors (ADR-0310). */
export const materializeOperationResult = <
	const TOperation extends OperationAstNode & { readonly kind: OperationKind },
>(
	operation: TOperation,
	result: RuntimeOperationResult<TOperation>,
): OperationResult<TOperation> => {
	if (!isRecordOperationResult(operation.kind)) {
		return result as unknown as OperationResult<TOperation>
	}

	if (result === null && isNullableOperationResult(operation.kind)) {
		return null as OperationResult<TOperation>
	}

	// Preserve schema-first mutation errors and collection-first find-many errors.
	const schema =
		operation.kind === 'find-many' ? undefined : readOperationSchema(operation)

	if (isCollectionOperationResult(operation.kind)) {
		if (!isUnknownArray(result)) {
			throw new TypeError('Runtime collection result must be an array')
		}

		const targetSchema = schema ?? readOperationSchema(operation)

		return immutableArray(
			result.map((record, index) =>
				materializeRecord(
					targetSchema,
					record,
					`Runtime result[${String(index)}]`,
					operation,
				),
			),
		) as OperationResult<TOperation>
	}

	return materializeRecord(
		schema ?? readOperationSchema(operation),
		result,
		'Runtime result',
		operation,
	) as OperationResult<TOperation>
}
