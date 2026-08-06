import {
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

/** Describes one normalized pointer branch without choosing a loading strategy. */
export interface RuntimePointerInclusion {
	readonly field: string
	readonly query: QueryAst
}

export type RuntimePointerTargetOperation = FindOneOperationAst<
	SchemaDefinition,
	QueryExpressionNode,
	QueryFieldName<SchemaDefinition>,
	unknown
>

const emptyInclusions: readonly RuntimePointerInclusion[] = immutableArray([])

/** Selects only terminals whose public result can contain pointer values. */
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
export const readPointerInclusions = (
	operation: DatabaseOperationAst,
): readonly RuntimePointerInclusion[] => {
	if (!operationReturnsRecords(operation) || !('query' in operation)) {
		return emptyInclusions
	}

	const query: unknown = operation.query

	if (!isPlainRecord(query) || !isPlainRecord(query.inclusion)) {
		return emptyInclusions
	}

	const pointers: unknown = query.inclusion.pointers

	if (!isUnknownArray(pointers) || pointers.length === 0) {
		return emptyInclusions
	}

	return immutableArray(
		pointers.map((candidate, index) => {
			if (
				!isPlainRecord(candidate) ||
				candidate.kind !== 'included-pointer' ||
				typeof candidate.field !== 'string' ||
				!isPlainRecord(candidate.query) ||
				candidate.query.kind !== 'query' ||
				!isPlainRecord(candidate.query.schema) ||
				!Schema.is(candidate.query.schema.definition)
			) {
				throw new TypeError(
					`Runtime pointer inclusion[${String(index)}] is invalid`,
				)
			}

			return immutableRecord({
				field: candidate.field,
				query: candidate.query as unknown as QueryAst,
			})
		}),
	)
}

/** Creates the singular target shape used for Access and field output processing. */
export const createPointerInclusionOperation = (
	inclusion: RuntimePointerInclusion,
): RuntimePointerTargetOperation =>
	immutableRecord({
		kind: 'find-one',
		query: inclusion.query,
	})
