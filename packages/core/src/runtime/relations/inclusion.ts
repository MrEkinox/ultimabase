import {
	type FindManyOperationAst,
	type FindOneOperationAst,
	type QueryAst,
	type QueryExpressionNode,
	type QueryFieldName,
} from '../../query/index.js'
import { Schema, type SchemaDefinition } from '../../schema/index.js'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import type { DatabaseOperationAst } from '../database/contracts.js'

/** Describes one normalized eager branch without choosing a loading strategy. */
export interface RuntimeInclusion {
	readonly field: string
	readonly kind: 'pointer' | 'relation'
	readonly query: QueryAst
}

export type RuntimeInclusionTargetOperation =
	| FindOneOperationAst<
			SchemaDefinition,
			QueryExpressionNode,
			QueryFieldName<SchemaDefinition>,
			unknown
	  >
	| FindManyOperationAst<
			SchemaDefinition,
			QueryExpressionNode,
			QueryFieldName<SchemaDefinition>,
			unknown
	  >

const emptyInclusions: readonly RuntimeInclusion[] = immutableArray([])

/** Selects only terminals whose public result can contain relationship values. */
const operationReturnsRecords = (operation: DatabaseOperationAst): boolean => {
	switch (operation.kind) {
		case 'delete-one':
		case 'find-many':
		case 'find-one':
		case 'get':
		case 'update-one':
		case 'upsert-one':
			return true
		case 'count':
		case 'create-many':
		case 'create-one':
		case 'delete-many':
		case 'exists':
		case 'update-many':
		case 'upsert-many':
			return false
	}
}

/** Reads normalized inclusion nodes without trusting an adapter-owned value. */
export const readInclusions = (
	operation: DatabaseOperationAst,
): readonly RuntimeInclusion[] => {
	if (!operationReturnsRecords(operation) || !('query' in operation)) {
		return emptyInclusions
	}

	const query: unknown = operation.query

	if (!isPlainRecord(query) || !isPlainRecord(query.inclusion)) {
		return emptyInclusions
	}

	const fields: unknown = query.inclusion.fields

	if (!isUnknownArray(fields) || fields.length === 0) {
		return emptyInclusions
	}

	return immutableArray(
		fields.map((candidate, index) => {
			if (
				!isPlainRecord(candidate) ||
				(candidate.kind !== 'included-pointer' &&
					candidate.kind !== 'included-relation') ||
				typeof candidate.field !== 'string' ||
				!isPlainRecord(candidate.query) ||
				candidate.query.kind !== 'query' ||
				!isPlainRecord(candidate.query.schema) ||
				!Schema.is(candidate.query.schema.definition)
			) {
				throw new TypeError(
					`Runtime inclusion[${String(index)}] is invalid`,
				)
			}

			return immutableRecord({
				field: candidate.field,
				kind:
					candidate.kind === 'included-pointer'
						? ('pointer' as const)
						: ('relation' as const),
				query: candidate.query as unknown as QueryAst,
			})
		}),
	)
}

/** Creates the singular target shape used for Access and field output processing. */
export const createInclusionOperation = (
	inclusion: RuntimeInclusion,
): RuntimeInclusionTargetOperation =>
	inclusion.kind === 'pointer'
		? immutableRecord({ kind: 'find-one' as const, query: inclusion.query })
		: immutableRecord({ kind: 'find-many' as const, query: inclusion.query })
