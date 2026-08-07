import { assertNonEmptyString, immutableRecord } from '@ultimabase/shared'

import { FrameworkError } from '../../foundation.js'
import type {
	OperationObjectId,
	UpdateOneOperationAst,
} from '../../query/operations/contracts.js'
import type { OperationOptions } from '../../query/operations/options.js'
import type { InferQueryResult } from '../../query/query/result.js'
import {
	executeQueryCount,
	executeQueryExists,
	executeQueryFindMany,
	executeQueryFindOne,
	executeQueryGet,
	executeQueryWithPrivateScope,
	QueryBuilder,
	scopeQueryToObjectId,
	scopeQueryToRelation,
} from '../../query/query/query.js'
import {
	queryFromCountInput,
	queryFromExistsInput,
	queryFromFindManyInput,
	queryFromFindOneInput,
	queryFromGetInput,
	type CountInput,
	type ExactReadInput,
	type ExistsInput,
	type FindManyInput,
	type FindOneInput,
	type GetInput,
	type QueryIncludedPointerFromInput,
	type QuerySelectedFieldFromInput,
} from '../../query/query/input.js'
import type { RelationField } from '../fields/builtins/relation.js'
import { getFieldSchemaTarget } from '../fields/base/definition.js'
import { Schema, type SchemaDefinition } from '../schema/definition.js'
import {
	createRelationUpdateExpression,
	type RelationMutationAction,
	type RelationMutationOptions,
	type RelationMutationTargets,
	type RelationUpdateExpression,
} from './mutation.js'
import type { Pointer } from './pointer.js'

/** Selects only top-level to-many fields declared by one exact schema. */
export type SchemaRelationFieldName<TSchema extends SchemaDefinition> = {
	readonly [
		TFieldName in keyof TSchema['fields'] & string
	]: TSchema['fields'][TFieldName] extends RelationField ? TFieldName : never
}[keyof TSchema['fields'] & string]

/** Resolves the exact target schema retained by one relation field. */
export type SchemaRelationTarget<
	TSchema extends SchemaDefinition,
	TFieldName extends SchemaRelationFieldName<TSchema>,
> =
	TSchema['fields'][TFieldName] extends RelationField<infer TTarget>
		? TTarget
		: never

interface RelationState<
	TSource extends SchemaDefinition,
	TTarget extends SchemaDefinition,
> {
	readonly fieldName: string
	readonly source: TSource
	readonly sourceObjectId: string
	readonly target: TTarget
}

/** Executes one logical source update while keeping its object ID private. */
const executeRelationMutation = async <
	const TSource extends SchemaDefinition,
	const TTarget extends SchemaDefinition,
>(
	state: RelationState<TSource, TTarget>,
	action: RelationMutationAction,
	targets: Pointer<TTarget> | readonly Pointer<TTarget>[],
	options: RelationMutationOptions | undefined,
): Promise<void> => {
	const sourceQuery = scopeQueryToObjectId(
		new QueryBuilder(state.source),
		state.sourceObjectId as OperationObjectId<TSource>,
		{ nativeAccessDeniedAsMissing: true },
	)
	const update = createRelationUpdateExpression(
		state.source,
		state.fieldName as SchemaRelationFieldName<TSource>,
		state.target,
		action,
		targets,
	)
	const operation: UpdateOneOperationAst<
		TSource,
		RelationUpdateExpression<
			TSource,
			SchemaRelationFieldName<TSource>,
			RelationMutationAction,
			TTarget
		>
	> = immutableRecord({
		kind: 'update-one',
		query: sourceQuery.ast,
		update,
	})
	const result = await executeQueryWithPrivateScope(
		sourceQuery,
		operation,
		options,
	)

	if (result === null) {
		throw new FrameworkError(
			'NOT_FOUND',
			`Relation source ${state.source.className} object was missing or inaccessible.`,
			{ publicMessage: 'The requested object was not found.' },
		)
	}
}

const relationStates = new WeakMap<
	object,
	RelationState<SchemaDefinition, SchemaDefinition>
>()

/**
 * Represents one immutable, independently queryable to-many relationship.
 *
 * Persisted models create handles through `model.relation(fieldName)`. The
 * protected source identity and relationship restriction never enter the QueryBuilder
 * AST, so selection and business hooks cannot inspect or discard them.
 *
 * @example `const publishedTags = await post.relation('tags').findMany({ where: { published: { eq: true } } })`
 */
export class Relation<
	TSource extends SchemaDefinition = SchemaDefinition,
	TTarget extends SchemaDefinition = SchemaDefinition,
> {
	// Invariant nominal positions preserve exact source and target inference even
	// though the public handle deliberately exposes neither protected identity.
	declare private readonly sourceType: {
		readonly read: TSource
		readonly write: (source: TSource) => void
	}
	declare private readonly targetType: {
		readonly read: TTarget
		readonly write: (target: TTarget) => void
	}

	protected constructor(state: RelationState<TSource, TTarget>) {
		if (new.target !== ImmutableRelation) {
			throw new TypeError(
				'Relation handles must be created by a persisted schema model',
			)
		}

		relationStates.set(this, immutableRecord(state))

		// All operational state lives in the private WeakMap beside a frozen shell.
		Object.freeze(this)
	}

	/** Narrows an untrusted value to a framework-created Relation handle. */
	static is(value: unknown): value is Relation {
		return (
			typeof value === 'object' && value !== null && relationStates.has(value)
		)
	}

	/** Reads matching targets while retaining the protected relation scope. */
	findMany<const TInput extends FindManyInput<TTarget>>(
		input: ExactReadInput<TTarget, TInput, FindManyInput<TTarget>>,
		options?: OperationOptions,
	): Promise<
		readonly InferQueryResult<
			TTarget,
			QuerySelectedFieldFromInput<TTarget, TInput>,
			QueryIncludedPointerFromInput<TTarget, TInput>
		>[]
	>
	/** Reads every visible related target when no clauses are supplied. */
	findMany(
		input?: undefined,
		options?: OperationOptions,
	): Promise<readonly InferQueryResult<TTarget>[]>
	findMany(
		input: FindManyInput<TTarget> = {},
		options?: OperationOptions,
	): Promise<readonly object[]> {
		const state = this.getState()
		const query = scopeQueryToRelation(
			queryFromFindManyInput(state.target, input),
			state,
		)

		return executeQueryFindMany(query, options)
	}

	/** Reads the first matching related target. */
	findOne<const TInput extends FindOneInput<TTarget>>(
		input: ExactReadInput<TTarget, TInput, FindOneInput<TTarget>>,
		options?: OperationOptions,
	): Promise<InferQueryResult<
		TTarget,
		QuerySelectedFieldFromInput<TTarget, TInput>,
		QueryIncludedPointerFromInput<TTarget, TInput>
	> | null>
	/** Reads the first visible related target without applying a projection. */
	findOne(
		input?: undefined,
		options?: OperationOptions,
	): Promise<InferQueryResult<TTarget> | null>
	findOne(
		input: FindOneInput<TTarget> = {},
		options?: OperationOptions,
	): Promise<object | null> {
		const state = this.getState()
		const query = scopeQueryToRelation(
			queryFromFindOneInput(state.target, input),
			state,
		)

		return executeQueryFindOne(query, options)
	}

	/** Reads one related target by its exact identifier. */
	get<const TInput extends GetInput<TTarget>>(
		input: ExactReadInput<TTarget, TInput, GetInput<TTarget>>,
		options?: OperationOptions,
	): Promise<InferQueryResult<
		TTarget,
		QuerySelectedFieldFromInput<TTarget, TInput>,
		QueryIncludedPointerFromInput<TTarget, TInput>
	> | null> {
		const state = this.getState()
		const normalized = queryFromGetInput(state.target, input)
		const query = scopeQueryToRelation(normalized.query, state)

		return executeQueryGet(query, normalized.id, options)
	}

	/** Counts visible related targets without materializing them. */
	count(
		input: CountInput<TTarget> = {},
		options?: OperationOptions,
	): Promise<number> {
		const state = this.getState()
		const query = scopeQueryToRelation(
			queryFromCountInput(state.target, input),
			state,
		)

		return executeQueryCount(query, options)
	}

	/** Tests whether at least one visible related target matches. */
	exists(
		input: ExistsInput<TTarget> = {},
		options?: OperationOptions,
	): Promise<boolean> {
		const state = this.getState()
		const query = scopeQueryToRelation(
			queryFromExistsInput(state.target, input),
			state,
		)

		return executeQueryExists(query, options)
	}

	/**
	 * Adds one or more exact target pointers in a single transaction.
	 *
	 * Existing edges remain unchanged. Duplicate pointers in the same call are
	 * rejected before Runtime starts.
	 *
	 * @example `await post.relation('tags').connect(tag.pointer())`
	 */
	connect(
		targets: RelationMutationTargets<TTarget>,
		options?: RelationMutationOptions,
	): Promise<void> {
		return executeRelationMutation(this.getState(), 'connect', targets, options)
	}

	/**
	 * Removes one or more exact target pointers in a single transaction.
	 *
	 * @example `await post.relation('tags').disconnect(tag.pointer())`
	 */
	disconnect(
		targets: RelationMutationTargets<TTarget>,
		options?: RelationMutationOptions,
	): Promise<void> {
		return executeRelationMutation(
			this.getState(),
			'disconnect',
			targets,
			options,
		)
	}

	/**
	 * Replaces the complete target set atomically, including with an empty set.
	 *
	 * @example `await post.relation('tags').set([featured.pointer(), news.pointer()])`
	 */
	set(
		targets: readonly Pointer<TTarget>[],
		options?: RelationMutationOptions,
	): Promise<void> {
		return executeRelationMutation(this.getState(), 'set', targets, options)
	}

	/**
	 * Removes every edge atomically without requiring a synthetic empty target list.
	 *
	 * @example `await post.relation('tags').clear()`
	 */
	clear(options?: RelationMutationOptions): Promise<void> {
		return executeRelationMutation(this.getState(), 'clear', [], options)
	}

	/** Recovers the trusted state retained only by framework-created handles. */
	private getState(): RelationState<TSource, TTarget> {
		const state = relationStates.get(this)

		if (state === undefined) {
			throw new TypeError('Relation instance has no trusted relation state')
		}

		// Only createRelationHandle stores one state beside its exact generic handle.
		return state as RelationState<TSource, TTarget>
	}
}

/** Keeps the only constructible implementation private to the model factory. */
class ImmutableRelation<
	TSource extends SchemaDefinition,
	TTarget extends SchemaDefinition,
> extends Relation<TSource, TTarget> {
	// The forwarding constructor makes only this module-private implementation constructible.
	// eslint-disable-next-line @typescript-eslint/no-useless-constructor
	constructor(state: RelationState<TSource, TTarget>) {
		super(state)
	}
}

/** Creates one protected handle after the persisted-model boundary is verified. */
export const createRelationHandle = (
	source: SchemaDefinition,
	fieldName: string,
	sourceObjectId: unknown,
): Relation => {
	if (!Schema.is(source)) {
		throw new TypeError('Relation source must be created by Schema.define')
	}

	assertNonEmptyString(fieldName, 'Relation field name')
	assertNonEmptyString(sourceObjectId, 'Relation source object ID')
	const field = source.fields[fieldName]

	if (field?.kind !== 'relation') {
		throw new TypeError(
			`Schema model relation field must be a relation: ${source.className}.${fieldName}`,
		)
	}

	const target = getFieldSchemaTarget(field)?.()

	if (!Schema.is(target)) {
		throw new TypeError(
			`Schema model relation target is invalid: ${source.className}.${fieldName}`,
		)
	}

	const state: RelationState<SchemaDefinition, SchemaDefinition> = {
		fieldName,
		source,
		sourceObjectId,
		target,
	}

	return new ImmutableRelation(state)
}
