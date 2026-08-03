import {
	immutableArray,
	immutableRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import type { QueryTerminalOptions } from '../../query/operations/execution.js'
import type {
	UpdateExpressionNode,
	UpdateOperationNode,
} from '../../query/updates/contracts.js'
import type { RelationField } from '../fields/builtins/relation.js'
import type { SchemaDefinition } from '../schema/definition.js'
import { Pointer } from './pointer.js'
import type {
	SchemaRelationFieldName,
	SchemaRelationTarget,
} from './relation.js'

/** Names every atomic change supported by an immutable Relation handle. */
export type RelationMutationAction = 'clear' | 'connect' | 'disconnect' | 'set'

/** Requires at least one exact target for additive and subtractive mutations. */
export type RelationMutationTargets<TTarget extends SchemaDefinition> =
	Pointer<TTarget> | readonly [Pointer<TTarget>, ...Pointer<TTarget>[]]

/** Carries one normalized relationship change to Access, hooks, and adapters. */
export interface RelationMutationDelta<
	TTarget extends SchemaDefinition = SchemaDefinition,
	TAction extends RelationMutationAction = RelationMutationAction,
> {
	/** Selects the atomic relationship behavior. */
	readonly action: TAction
	/** Retains exact target identities in developer declaration order. */
	readonly targets: readonly Pointer<TTarget>[]
}

/** Identifies one relation field update without pretending it is a row column. */
export interface RelationUpdateOperationNode<
	TFieldName extends string = string,
	TTarget extends SchemaDefinition = SchemaDefinition,
	TAction extends RelationMutationAction = RelationMutationAction,
> extends UpdateExpressionNode {
	readonly field: TFieldName
	readonly kind: 'relation'
	readonly value: RelationMutationDelta<TTarget, TAction>
}

/** Preserves the normal update lifecycle around one logical relation delta. */
export interface RelationUpdateExpression<
	TSource extends SchemaDefinition = SchemaDefinition,
	TFieldName extends SchemaRelationFieldName<TSource> =
		SchemaRelationFieldName<TSource>,
	TAction extends RelationMutationAction = RelationMutationAction,
	TTarget extends SchemaDefinition = SchemaRelationTarget<TSource, TFieldName>,
> extends UpdateExpressionNode {
	readonly kind: 'update-expression'
	readonly operations: readonly [
		RelationUpdateOperationNode<TFieldName, TTarget, TAction>,
		...UpdateOperationNode<TSource>[],
	]
}

/** Keeps terminal execution choices out of the immutable relation delta. */
export type RelationMutationOptions = QueryTerminalOptions

/** Narrows an unknown update expression to Core's logical relation shape. */
export const isRelationUpdateExpression = (
	value: unknown,
): value is RelationUpdateExpression => {
	if (
		typeof value !== 'object' ||
		value === null ||
		!('kind' in value) ||
		value.kind !== 'update-expression' ||
		!('operations' in value) ||
		!isUnknownArray(value.operations)
	) {
		return false
	}

	return value.operations.some(
		(operation) =>
			typeof operation === 'object' &&
			operation !== null &&
			'kind' in operation &&
			operation.kind === 'relation',
	)
}

/** Snapshots exact pointers and rejects ambiguous duplicate target declarations. */
const normalizeTargets = <TTarget extends SchemaDefinition>(
	target: TTarget,
	value: Pointer<TTarget> | readonly Pointer<TTarget>[],
	allowEmpty: boolean,
): readonly Pointer<TTarget>[] => {
	const candidates = Pointer.is(value) ? [value] : value

	if (!isUnknownArray(candidates) || (!allowEmpty && candidates.length === 0)) {
		throw new TypeError('Relation mutation targets must contain a Pointer')
	}

	const ids = new Set<string>()
	const targets: Pointer<TTarget>[] = []

	for (const candidate of candidates) {
		if (!Pointer.is(candidate) || candidate.schema !== target) {
			throw new TypeError(
				`Relation mutation target must point to ${target.className}`,
			)
		}

		if (ids.has(candidate.id)) {
			throw new TypeError(
				`Relation mutation contains duplicate target ${JSON.stringify(candidate.id)}`,
			)
		}

		ids.add(candidate.id)
		// Reconstructing preserves exact generic identity after the runtime schema check.
		targets.push(new Pointer(target, candidate.id))
	}

	return immutableArray(targets)
}

/** Creates the only normalized expression emitted by public Relation methods. */
export const createRelationUpdateExpression = <
	const TSource extends SchemaDefinition,
	const TFieldName extends SchemaRelationFieldName<TSource>,
	const TAction extends RelationMutationAction,
	const TTarget extends SchemaDefinition,
>(
	source: TSource,
	fieldName: TFieldName,
	target: TTarget,
	action: TAction,
	values: Pointer<TTarget> | readonly Pointer<TTarget>[],
): RelationUpdateExpression<TSource, TFieldName, TAction, TTarget> => {
	const field = source.fields[fieldName]

	if (field?.kind !== 'relation') {
		throw new TypeError(
			`Relation mutation field must be a relation: ${source.className}.${fieldName}`,
		)
	}

	const emptyTargets: readonly Pointer<TTarget>[] = []
	const targets =
		action === 'clear'
			? immutableArray(emptyTargets)
			: normalizeTargets(target, values, action === 'set')
	const delta = immutableRecord({ action, targets })
	const operation = immutableRecord({
		field: fieldName,
		kind: 'relation' as const,
		value: delta,
	})

	return immutableRecord({
		kind: 'update-expression' as const,
		operations: immutableArray([operation]),
	})
}

/** Recovers the target type retained only by a declared relation field. */
export type RelationFieldTarget<TField extends RelationField> =
	TField extends RelationField<infer TTarget> ? TTarget : never
