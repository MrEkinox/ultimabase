import { createPointer } from './pointer.js'
import {
	immutableArray,
	immutableRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import type { OperationOptions } from '../../query/operations/options.js'
import type {
	UpdateExpressionNode,
	UpdateOperationNode,
} from '../../query/updates/contracts.js'
import type { SchemaDefinition } from '../schema/definition.js'
import type { Pointer } from './pointer.js'
import type {
	SchemaRelationFieldName,
	SchemaRelationTarget,
} from './relation.js'

/** Names every atomic change supported by an immutable Relation handle. */
export type RelationMutationAction =
	'clear' | 'connect' | 'create' | 'disconnect' | 'set' | 'update'

/** Requires at least one exact target for additive and subtractive mutations. */
export type RelationMutationTargets = string | readonly [string, ...string[]]

/** Carries one normalized relationship change to installed behaviors and adapters. */
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
export type RelationMutationOptions = OperationOptions

const hasKind = (value: unknown, kind: string): value is { kind: string } =>
	typeof value === 'object' &&
	value !== null &&
	'kind' in value &&
	value.kind === kind

/** Narrows an unknown update expression to Core's logical relation shape. */
export const isRelationUpdateExpression = (
	value: unknown,
): value is RelationUpdateExpression =>
	hasKind(value, 'update-expression') &&
	'operations' in value &&
	isUnknownArray(value.operations) &&
	value.operations.some((operation) => hasKind(operation, 'relation'))

/** Converts exact IDs to pointers and rejects ambiguous duplicate declarations. */
const normalizeTargets = <TTarget extends SchemaDefinition>(
	target: TTarget,
	value: string | readonly string[],
	allowEmpty: boolean,
): readonly Pointer<TTarget>[] => {
	const candidates = typeof value === 'string' ? [value] : value

	if (!isUnknownArray(candidates) || (!allowEmpty && candidates.length === 0)) {
		throw new TypeError('Relation mutation targets must contain an object ID')
	}

	const ids = new Set<string>()
	const targets: Pointer<TTarget>[] = []

	for (const candidate of candidates) {
		if (typeof candidate !== 'string' || candidate.length === 0) {
			throw new TypeError(
				`Relation mutation target for ${target.className} must be a non-empty object ID`,
			)
		}

		if (ids.has(candidate)) {
			throw new TypeError(
				`Relation mutation contains duplicate target ${JSON.stringify(candidate)}`,
			)
		}

		ids.add(candidate)
		targets.push(createPointer(target, candidate))
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
	values: string | readonly string[],
): RelationUpdateExpression<TSource, TFieldName, TAction, TTarget> => {
	const field = source.fields[fieldName]

	if (field?.kind !== 'relation') {
		throw new TypeError(
			`Relation mutation field must be a relation: ${source.className}.${fieldName}`,
		)
	}

	// Clear ignores caller values; only set accepts an explicitly empty replacement.
	const targets =
		action === 'clear'
			? normalizeTargets(target, [], true)
			: normalizeTargets(target, values, action === 'set')
	const operation = immutableRecord({
		field: fieldName,
		kind: 'relation' as const,
		value: immutableRecord({ action, targets }),
	})

	return immutableRecord({
		kind: 'update-expression' as const,
		operations: immutableArray([operation]),
	})
}
