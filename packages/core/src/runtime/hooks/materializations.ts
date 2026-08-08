import { immutableArray, immutableRecord, isPlainRecord } from '@ultimabase/shared'

import {
	applyUpdateExpressionToRecord,
	type ExecutableOperationAst,
	type UpdateExpressionNode,
} from '../../query/index.js'
import { Schema } from '../../schema/index.js'
import { isRelationUpdateExpression } from '../../schema/relations/mutation.js'
import type {
	DatabaseLogicalRecord,
	DatabaseMutationMaterializationSource,
	DatabaseMutationOperationAst,
	DatabaseMutationOperationKind,
} from '../database/contracts.js'
import { getOperationSchema } from '../operations/schema.js'

/** Correlates the complete logical value before and after one materialized item. */
export interface RuntimeMutationItemPair {
	readonly originalItem: DatabaseLogicalRecord | null
	readonly item: DatabaseLogicalRecord | null
}

const emptyMutationItems: readonly RuntimeMutationItemPair[] = immutableArray([])

const createItemPair = (
	originalItem: DatabaseLogicalRecord | null,
	item: DatabaseLogicalRecord | null,
): RuntimeMutationItemPair => immutableRecord({ originalItem, item })

/**
 * Builds the candidate snapshots available before persistence.
 *
 * Atomic upserts deliberately remain empty because their create/update branch
 * is not known until the database statement executes. Set-based updates and
 * deletes likewise avoid materializing every matching row.
 */
export const collectMutationBeforeItems = (
	operation: DatabaseMutationOperationAst,
	target: DatabaseLogicalRecord | null | undefined,
): readonly RuntimeMutationItemPair[] => {
	type RuntimeMutationOperation = Extract<
		ExecutableOperationAst,
		{ readonly kind: DatabaseMutationOperationKind }
	>
	const runtimeOperation = operation as unknown as RuntimeMutationOperation

	switch (runtimeOperation.kind) {
		case 'create-one':
			return immutableArray([createItemPair(null, runtimeOperation.input)])
		case 'create-many':
			return immutableArray(
				runtimeOperation.inputs.map((input) => createItemPair(null, input)),
			)
		case 'update-one': {
			if (target === undefined) {
				throw new TypeError('Prepared update hooks require a target boundary')
			}

			if (target === null) return emptyMutationItems

			const update: unknown = runtimeOperation.update
			const schema = getOperationSchema(runtimeOperation)

			if (!Schema.is(schema)) {
				throw new TypeError('Prepared update hooks require a declared schema')
			}
			const item =
				isPlainRecord(update) && update.kind === 'update-expression'
					? isRelationUpdateExpression(update)
						? target
						: applyUpdateExpressionToRecord(
							schema,
							target,
							update as unknown as UpdateExpressionNode,
							)
					: target

			return immutableArray([createItemPair(target, item)])
		}
		case 'delete-one':
			if (target === undefined) {
				throw new TypeError('Prepared delete hooks require a target boundary')
			}

			return target === null
				? emptyMutationItems
				: immutableArray([createItemPair(target, null)])
		case 'delete-many':
		case 'update-many':
		case 'upsert-many':
		case 'upsert-one':
			return emptyMutationItems
	}
}

/** Builds exact persisted item pairs independently from the public selection. */
export const collectMutationAfterItems = (
	outcome: DatabaseMutationMaterializationSource,
): readonly RuntimeMutationItemPair[] =>
	immutableArray(
		outcome.materializations.map((materialization) => {
			switch (materialization.kind) {
				case 'create':
					return createItemPair(null, materialization.current)
				case 'update':
					return createItemPair(
						materialization.previous,
						materialization.current,
					)
				case 'delete':
					return createItemPair(materialization.previous, null)
			}
		}),
	)
