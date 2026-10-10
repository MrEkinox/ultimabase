import { isUnknownArray } from '@ultimabase/shared'

import type {
	UpdateExpressionNode,
	UpdateOperationNode,
} from '../../query/updates/contracts.js'
import type { SchemaDefinition, SchemaReference } from '../schema/definition.js'
import type { Pointer } from './pointer.js'
import type {
	SchemaRelationshipFieldName,
	SchemaRelationshipSource,
	SchemaRelationshipTargetName,
	SchemaTypeInfoSource,
} from '../type-info.js'

/** Names the to-many relation fields of one schema. */
export type SchemaRelationFieldName<TSchema extends SchemaTypeInfoSource> =
	SchemaRelationshipFieldName<TSchema, 'relation'>

/** Resolves the exact target schema retained by one relation field. */
export type SchemaRelationTarget<
	TSchema extends SchemaTypeInfoSource,
	TFieldName extends SchemaRelationFieldName<TSchema>,
> = [SchemaRelationshipSource<TSchema, TFieldName>] extends [never]
	? string extends SchemaRelationshipTargetName<TSchema, TFieldName>
		? SchemaDefinition
		: SchemaReference<SchemaRelationshipTargetName<TSchema, TFieldName>>
	: Extract<SchemaRelationshipSource<TSchema, TFieldName>, SchemaDefinition>

/** Names every atomic change of one relation update expression. */
export type RelationMutationAction =
	'clear' | 'connect' | 'create' | 'disconnect' | 'set' | 'update'

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
