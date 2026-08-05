import {
	immutableArray,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import type {
	InferOperationResult,
	OperationAstNode,
	OperationKind,
} from '../../query/index.js'
import { Schema, type SchemaDefinition } from '../../schema/index.js'
import { materializeSchemaModel } from '../../schema/schema/model.js'
import type { RuntimeOperationResult } from '../pipeline/contracts.js'
import {
	isNonAtomicBulkOperation,
	mapNonAtomicBulkResult,
} from './non-atomic-result.js'
import { readRuntimeSchemaModelMetadata } from './model-metadata.js'
import { getOperationSchema } from './schema.js'
import {
	createPointerInclusionOperation,
	readPointerInclusions,
} from '../relations/pointer-inclusion.js'

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
	if (!isPlainRecord(value)) {
		throw new TypeError(`${path} must be a plain logical record`)
	}
	let values = value

	if (operation !== undefined) {
		const hydrated: Record<string, unknown> = { ...value }

		for (const inclusion of readPointerInclusions(operation)) {
			const target: unknown = value[inclusion.field]

			if (!isPlainRecord(target)) continue

			const targetOperation = createPointerInclusionOperation(inclusion)

			hydrated[inclusion.field] = materializeRecord(
				readOperationSchema(targetOperation),
				target,
				`${path}.${inclusion.field}`,
				targetOperation,
			)
		}

		values = hydrated
	}

	return materializeSchemaModel(
		schema,
		values,
		readRuntimeSchemaModelMetadata(value),
	)
}

/** Materializes public model instances only after Runtime finishes every result hook. */
export const materializeOperationResult = <
	const TOperation extends OperationAstNode & { readonly kind: OperationKind },
>(
	operation: TOperation,
	result: RuntimeOperationResult<TOperation>,
): InferOperationResult<TOperation> => {
	switch (operation.kind) {
		case 'count':
		case 'delete-many':
		case 'exists':
		case 'update-many':
			return result as unknown as InferOperationResult<TOperation>
		case 'create-many':
		case 'upsert-many': {
			const schema = readOperationSchema(operation)

			if (isNonAtomicBulkOperation(operation)) {
				return mapNonAtomicBulkResult(
					result,
					'Runtime collection result',
					(record, index) =>
						materializeRecord(
							schema,
							record,
							`Runtime result[${String(index)}]`,
							operation,
						),
				) as InferOperationResult<TOperation>
			}

			if (!isUnknownArray(result)) {
				throw new TypeError('Runtime collection result must be an array')
			}

			return immutableArray(
				result.map((record, index) =>
					materializeRecord(
						schema,
						record,
						`Runtime result[${String(index)}]`,
						operation,
					),
				),
			) as InferOperationResult<TOperation>
		}
		case 'find': {
			if (!isUnknownArray(result)) {
				throw new TypeError('Runtime collection result must be an array')
			}

			const schema = readOperationSchema(operation)

			return immutableArray(
				result.map((record, index) =>
					materializeRecord(
						schema,
						record,
						`Runtime result[${String(index)}]`,
						operation,
					),
				),
			) as InferOperationResult<TOperation>
		}
		case 'delete-one':
		case 'first':
		case 'get':
		case 'update-one':
			if (result === null) {
				return null as InferOperationResult<TOperation>
			}
			return materializeRecord(
				readOperationSchema(operation),
				result,
				'Runtime result',
				operation,
			) as InferOperationResult<TOperation>
		case 'create-one':
		case 'upsert-one':
			return materializeRecord(
				readOperationSchema(operation),
				result,
				'Runtime result',
			) as InferOperationResult<TOperation>
	}
}
