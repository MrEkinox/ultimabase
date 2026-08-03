import {
	type FirstOperationAst,
	type QueryAst,
	type QueryExpressionNode,
	type QueryFieldName,
} from '../../query/index.js'
import { createQueryValueFilter } from '../../query/filters/factory.js'
import { Pointer, Schema, type SchemaDefinition } from '../../schema/index.js'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import type {
	DatabaseOperationAst,
	DatabaseOperationResult,
	DatabaseRowFilterNode,
} from '../database/contracts.js'
import { transferRuntimeSchemaModelMetadata } from '../operations/model-metadata.js'

interface RuntimePointerInclusion {
	readonly field: string
	readonly query: QueryAst
}

type RuntimePointerTargetOperation = FirstOperationAst<
	SchemaDefinition,
	QueryExpressionNode,
	QueryFieldName<SchemaDefinition>,
	unknown
>

/** Executes one target operation through the request engine that owns the parent. */
export interface PointerInclusionTargetExecutor {
	execute(
		operation: RuntimePointerTargetOperation,
		rowFilter: DatabaseRowFilterNode,
	): Promise<unknown>
}

const emptyInclusions: readonly RuntimePointerInclusion[] = immutableArray([])

/** Selects only terminals whose public result can contain pointer values. */
const operationReturnsRecords = (operation: DatabaseOperationAst): boolean => {
	switch (operation.kind) {
		case 'delete-one':
		case 'find':
		case 'first':
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
const readPointerInclusions = (
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

/** Creates the monotonic target identity that no Query hook can replace. */
const createPointerTargetFilter = (pointer: Pointer): DatabaseRowFilterNode =>
	createQueryValueFilter(pointer.schema, 'equal', 'id', pointer.id)

/** Loads one allowed target or returns the same null used for a missing object. */
const resolvePointerTarget = async (
	pointer: Pointer,
	inclusion: RuntimePointerInclusion,
	executor: PointerInclusionTargetExecutor,
): Promise<unknown> => {
	if (inclusion.query.schema.definition !== pointer.schema) {
		throw new TypeError(
			`Runtime pointer inclusion ${inclusion.field} targets the wrong schema`,
		)
	}

	const operation: RuntimePointerTargetOperation = immutableRecord({
		kind: 'first',
		query: inclusion.query,
	})

	return executor.execute(operation, createPointerTargetFilter(pointer))
}

/** Expands every visible source pointer while preserving protected parent metadata. */
const resolveRecordInclusions = async (
	record: unknown,
	inclusions: readonly RuntimePointerInclusion[],
	executor: PointerInclusionTargetExecutor,
): Promise<Readonly<Record<string, unknown>>> => {
	if (!isPlainRecord(record)) {
		throw new TypeError('Runtime pointer inclusion source must be a record')
	}

	const resolved: Record<string, unknown> = { ...record }

	for (const inclusion of inclusions) {
		if (!Object.hasOwn(record, inclusion.field)) {
			// Source field Access removes the key before inclusion resolution begins.
			continue
		}

		const value: unknown = record[inclusion.field]

		if (value === null || value === undefined) {
			continue
		}

		if (!Pointer.is(value)) {
			throw new TypeError(
				`Runtime pointer inclusion ${inclusion.field} must receive a Pointer`,
			)
		}

		resolved[inclusion.field] = await resolvePointerTarget(
			value,
			inclusion,
			executor,
		)
	}

	const snapshot = immutableRecord(resolved)

	transferRuntimeSchemaModelMetadata(record, snapshot)

	return snapshot
}

/**
 * Resolves logical pointer inclusions only after the parent completed its full
 * Runtime pipeline, so hidden source fields never trigger target reads.
 */
export const resolvePointerInclusions = async <
	const TOperation extends DatabaseOperationAst,
>(
	operation: TOperation,
	result: DatabaseOperationResult<TOperation>,
	executor: PointerInclusionTargetExecutor,
): Promise<DatabaseOperationResult<TOperation>> => {
	const inclusions = readPointerInclusions(operation)

	if (inclusions.length === 0 || result === null) {
		return result
	}

	if (operation.kind === 'find') {
		if (!isUnknownArray(result)) {
			throw new TypeError(
				'Runtime pointer inclusion collection must be an array',
			)
		}

		return immutableArray(
			await Promise.all(
				result.map((record) =>
					resolveRecordInclusions(record, inclusions, executor),
				),
			),
		) as DatabaseOperationResult<TOperation>
	}

	return (await resolveRecordInclusions(
		result,
		inclusions,
		executor,
	)) as DatabaseOperationResult<TOperation>
}
