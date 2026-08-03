import { assertNonEmptyString, immutableRecord } from '@ultimabase/shared'

import { Query, scopeQueryToRelation } from '../../query/query/query.js'
import type { RelationField } from '../fields/builtins/relation.js'
import { getFieldSchemaTarget } from '../fields/base/definition.js'
import { Schema, type SchemaDefinition } from '../schema/definition.js'

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

const relationStates = new WeakMap<
	object,
	RelationState<SchemaDefinition, SchemaDefinition>
>()

/**
 * Represents one immutable, independently queryable to-many relationship.
 *
 * Persisted models create handles through `model.relation(fieldName)`. The
 * protected source identity and relationship restriction never enter the Query
 * AST, so selection and business hooks cannot inspect or discard them.
 *
 * @example `const publishedTags = post.relation('tags').query().equalTo('published', true)`
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

	/**
	 * Starts one ordinary target Query restricted to this exact relationship.
	 *
	 * Every regular read builder and terminal remains available. The terminal
	 * inherits ambient execution or accepts the same final options as any Query.
	 *
	 * @example `await post.relation('tags').query().select('id', 'label').find()`
	 */
	query(): Query<TTarget> {
		const state = relationStates.get(this)

		if (state === undefined) {
			throw new TypeError('Relation instance has no trusted relation state')
		}

		// The record originates only from createRelationHandle with matching generics.
		const exactState = state as RelationState<TSource, TTarget>

		return scopeQueryToRelation(new Query(exactState.target), exactState)
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
