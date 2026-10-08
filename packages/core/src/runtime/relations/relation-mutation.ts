import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'
import { isFieldNullable } from '../../schema/fields/base/options.js'

import type {
	FindManyOperationAst,
	FindOneOperationAst,
	QueryFieldName,
	UpdateExpressionNode,
	UpdateOneOperationAst,
} from '../../query/index.js'
import { FrameworkError } from '../../foundation.js'
import { normalizeLogicalFilter } from '../../query/filters/logical.js'
import { createQueryValueFilter } from '../../query/filters/factory.js'
import { createQueryAst } from '../../query/ast/factory.js'
import {
	Pointer,
	Schema,
	type RelationMutationDelta,
	type RelationMutationAction,
	type SchemaDefinition,
	type SchemaTargetGraph,
} from '../../schema/index.js'
import type {
	DatabaseOperationAst,
	DatabaseRelationScope,
	DatabaseRowFilterNode,
} from '../database/contracts.js'
import { getOperationSchema } from '../operations/schema.js'
import { createProtectedObjectNotFoundError } from '../operations/target-errors.js'

/** Retains the only relation mutation details Runtime may interpret. */
export interface RuntimeRelationMutation {
	readonly delta: RelationMutationDelta
	readonly fieldName: string
}

/** Supplies only the engine capabilities needed by relation orchestration. */
export interface RuntimeRelationMutationExecutor {
	assertOwnsSchema(schema: SchemaDefinition): void
	execute(
		operation: DatabaseOperationAst,
		rowFilter?: DatabaseRowFilterNode,
		protectedPolicyDeniedAsMissing?: true,
		privateObjectId?: string,
	): Promise<unknown>
	getSchemaTargets(): SchemaTargetGraph
}

/** Narrows the closed action set before Runtime snapshots one delta. */
const isRelationMutationAction = (
	value: string,
): value is RelationMutationAction =>
	value === 'clear' ||
	value === 'connect' ||
	value === 'disconnect' ||
	value === 'set'

/** Reads one normalized logical edge update without accepting scalar lookalikes. */
export const readRuntimeRelationMutation = (
	operation: DatabaseOperationAst,
): RuntimeRelationMutation | undefined => {
	if (
		operation.kind !== 'update-one' ||
		!('update' in operation) ||
		!isPlainRecord(operation.update) ||
		operation.update.kind !== 'update-expression' ||
		!isUnknownArray(operation.update.operations)
	) {
		return undefined
	}

	const candidates: Readonly<Record<string, unknown>>[] = []

	for (const candidate of operation.update.operations) {
		if (isPlainRecord(candidate) && candidate.kind === 'relation') {
			candidates.push(candidate)
		}
	}

	if (candidates.length === 0) {
		return undefined
	}

	if (candidates.length !== 1) {
		throw new TypeError(
			'Runtime relation update must contain one relation delta',
		)
	}

	const [candidate] = candidates

	if (
		candidate === undefined ||
		typeof candidate.field !== 'string' ||
		!isPlainRecord(candidate.value) ||
		typeof candidate.value.action !== 'string' ||
		!isRelationMutationAction(candidate.value.action) ||
		!isUnknownArray(candidate.value.targets)
	) {
		throw new TypeError('Runtime relation update contains an invalid delta')
	}
	const action = candidate.value.action
	const targets = candidate.value.targets.filter((target) => Pointer.is(target))

	if (targets.length !== candidate.value.targets.length) {
		throw new TypeError('Runtime relation update contains an invalid delta')
	}

	return immutableRecord({
		delta: immutableRecord({ action, targets: immutableArray(targets) }),
		fieldName: candidate.field,
	})
}

/** Builds one protected target lookup whose object ID stays outside behavior-visible AST. */
export const createRelationTargetLookup = <TSchema extends SchemaDefinition>(
	pointer: Pointer<TSchema>,
): Readonly<{
	operation: FindOneOperationAst<TSchema>
	rowFilter: DatabaseRowFilterNode
}> => {
	const query = createQueryAst(pointer.schema)
	const rowFilter = createQueryValueFilter(
		pointer.schema,
		'equal',
		'id',
		pointer.id,
	) as DatabaseRowFilterNode

	return immutableRecord({
		operation: immutableRecord({ kind: 'find-one' as const, query }),
		rowFilter,
	})
}

/** Builds the private target set used to implement inverse-pointer set and clear. */
export const createInversePointerTargetLookup = <
	TTarget extends SchemaDefinition,
	TSource extends SchemaDefinition,
>(
	target: TTarget,
	mappedFieldName: string,
	source: Pointer<TSource>,
): Readonly<{
	operation: FindManyOperationAst<TTarget>
	rowFilter: DatabaseRowFilterNode
}> => {
	const query = createQueryAst(target)
	const rowFilter = createQueryValueFilter(
		target,
		'equal',
		mappedFieldName as QueryFieldName<TTarget>,
		source,
	) as DatabaseRowFilterNode

	return immutableRecord({
		operation: immutableRecord({
			kind: 'find-many' as const,
			query,
		}),
		rowFilter,
	})
}

/** Creates one ordinary pointer update for an inverse relation edge. */
export const createInversePointerUpdate = <
	TTarget extends SchemaDefinition,
	TSource extends SchemaDefinition,
>(
	target: Pointer<TTarget>,
	mappedFieldName: string,
	source: Pointer<TSource>,
	action: 'connect' | 'disconnect',
): Readonly<{
	operation: UpdateOneOperationAst<TTarget, UpdateExpressionNode>
	rowFilter: DatabaseRowFilterNode
}> => {
	const query = createQueryAst(target.schema)
	const idFilter = createQueryValueFilter(
		target.schema,
		'equal',
		'id',
		target.id,
	) as DatabaseRowFilterNode
	const ownerFilter = createQueryValueFilter(
		target.schema,
		'equal',
		mappedFieldName as QueryFieldName<TTarget>,
		source,
	) as DatabaseRowFilterNode
	const field = target.schema.persistedFields[mappedFieldName]
	if (
		action === 'disconnect' &&
		(field === undefined || !isFieldNullable(field))
	) {
		throw new TypeError(
			'Inverse pointer disconnect requires an optional mapped field',
		)
	}
	const fieldOperation = immutableRecord({
		field: mappedFieldName,
		kind: 'set' as const,
		value: action === 'connect' ? source : null,
	})
	const update = immutableRecord({
		kind: 'update-expression' as const,
		operations: immutableArray([fieldOperation]),
	})

	return immutableRecord({
		operation: immutableRecord({
			kind: 'update-one' as const,
			query,
			update,
		}),
		rowFilter:
			action === 'connect'
				? idFilter
				: // Ownership is framework-owned: identity AND current owner, never widened.
					normalizeLogicalFilter({
						kind: 'and',
						expressions: [idFilter, ownerFilter],
					}),
	})
}

/** Reads one protected materialized ID without depending on a concrete model class. */
const readMaterializedObjectId = (value: unknown): string => {
	if (
		typeof value !== 'object' ||
		value === null ||
		!('id' in value) ||
		typeof value.id !== 'string'
	) {
		throw new TypeError('Inverse relation target lookup must return object IDs')
	}

	return value.id
}

/**
 * Validates relation targets and lowers inverse pointers to ordinary updates.
 *
 * The caller invokes this only inside the relation mutation's inherited or
 * automatic transaction, so every nested read and write shares its rollback.
 */
export const executeRuntimeRelationMutation = async (
	operation: DatabaseOperationAst,
	privateObjectId: string | undefined,
	executor: RuntimeRelationMutationExecutor,
): Promise<DatabaseRelationScope | undefined> => {
	const mutation = readRuntimeRelationMutation(operation)

	if (mutation === undefined) {
		return undefined
	}

	const source = getOperationSchema(operation)

	if (!Schema.is(source) || privateObjectId === undefined) {
		throw new FrameworkError(
			'VALIDATION_ERROR',
			'Relation mutation requires one protected persisted source identity.',
			{ publicMessage: 'The requested relation is not available.' },
		)
	}

	// Resolve the graph lazily so unrelated operations remain executable before startup.
	const mapping = executor
		.getSchemaTargets()
		.getRelation(source, [mutation.fieldName])

	if (mapping === undefined) {
		throw new FrameworkError(
			'VALIDATION_ERROR',
			'Relation mutation does not match the application relationship graph.',
			{ publicMessage: 'The requested relation is not available.' },
		)
	}

	const relationScope = immutableRecord({
		fieldPath: immutableArray([mutation.fieldName]),
		source,
		sourceObjectId: privateObjectId,
		target: mapping.target,
	})

	for (const pointer of mutation.delta.targets) {
		executor.assertOwnsSchema(pointer.schema)

		if (pointer.schema !== mapping.target) {
			throw new FrameworkError(
				'VALIDATION_ERROR',
				'Relation mutation target does not match the resolved relationship.',
				{ publicMessage: 'The requested relation is not available.' },
			)
		}

		const lookup = createRelationTargetLookup(pointer)
		const target = await executor.execute(
			lookup.operation,
			lookup.rowFilter,
			true,
		)

		if (target === null) {
			throw createProtectedObjectNotFoundError()
		}
	}

	if (mapping.mappedBy?.kind !== 'pointer') {
		return relationScope
	}

	if (!Schema.is(mapping.target)) {
		throw new TypeError(
			'Inverse relation target must be a declared schema class',
		)
	}

	const targetSchema = mapping.target
	const sourcePointer = source.pointer(privateObjectId)
	const requestedTargets = mutation.delta.targets.map((pointer) =>
		targetSchema.pointer(pointer.id),
	)
	const requestedIds = new Set(requestedTargets.map((pointer) => pointer.id))
	let currentTargets: readonly Pointer<typeof targetSchema>[] = []
	const mappedFieldName = mapping.mappedBy.fieldPath[0]

	if (mappedFieldName === undefined) {
		throw new TypeError('Inverse relation pointer mapping is empty')
	}

	if (mutation.delta.action === 'clear' || mutation.delta.action === 'set') {
		const lookup = createInversePointerTargetLookup(
			targetSchema,
			mappedFieldName,
			sourcePointer,
		)
		const results = await executor.execute(lookup.operation, lookup.rowFilter)

		if (!Array.isArray(results)) {
			throw new TypeError(
				'Inverse relation target lookup must return a collection',
			)
		}

		currentTargets = results.map((result) =>
			targetSchema.pointer(readMaterializedObjectId(result)),
		)
	}

	const connectTargets =
		mutation.delta.action === 'connect'
			? requestedTargets
			: mutation.delta.action === 'set'
				? requestedTargets.filter(
						(pointer) =>
							!currentTargets.some((current) => current.equals(pointer)),
					)
				: []
	const disconnectTargets =
		mutation.delta.action === 'disconnect'
			? requestedTargets
			: mutation.delta.action === 'clear'
				? currentTargets
				: mutation.delta.action === 'set'
					? currentTargets.filter((pointer) => !requestedIds.has(pointer.id))
					: []

	for (const pointer of disconnectTargets) {
		const update = createInversePointerUpdate(
			pointer,
			mappedFieldName,
			sourcePointer,
			'disconnect',
		)

		await executor.execute(update.operation, update.rowFilter, true, pointer.id)
	}

	for (const pointer of connectTargets) {
		const update = createInversePointerUpdate(
			pointer,
			mappedFieldName,
			sourcePointer,
			'connect',
		)
		const result = await executor.execute(
			update.operation,
			update.rowFilter,
			true,
			pointer.id,
		)

		if (result === null) {
			throw createProtectedObjectNotFoundError()
		}
	}

	return relationScope
}
