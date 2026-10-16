import {
	assertNonEmptyString,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import { createFieldDefinition } from '../base/definition.js'
import {
	assertBuiltInFieldOptions,
	assertFieldOptions,
	type BuiltInFieldOptionsContract,
} from '../base/options.js'
import type {
	FieldDefinition,
	FieldOptionValueCarrier,
	FieldTypeState,
} from '../base/contract.js'
import type {
	SchemaDefinition,
	SchemaReference,
} from '../../schema/definition.js'
import type { SchemaTarget } from '../../schema/targets.js'
import type { DeclaredSchemaTarget } from '../../schema/deferred-targets.js'
import { snapshotCapturedOptionValue } from '../../schema/captured-options.js'
import type { RequestContext } from '../../../runtime/context/request-context.js'
import type { WhereBuilder, WhereInput } from '../../../query/filters/where.js'
import type { SchemaRelationshipFieldName } from '../../type-info.js'
import { assertPlainObject } from '../../../exact-object-validation.js'

declare const relationTargetMarker: unique symbol

/** Omits relation collections from ordinary row values and mutation inputs. */
export interface RelationFieldTypeState extends FieldTypeState {
	readonly create: 'forbidden'
	readonly object: 'forbidden'
	readonly update: 'forbidden'
	readonly nullable: false
	readonly list: false
}

/** Selects target fields that can own one inverse relationship. */
export type RelationMappedFieldName<TTarget extends SchemaDefinition> =
	SchemaRelationshipFieldName<TTarget, 'pointer' | 'relation'>

/** Receives only request state and an empty immutable builder for the target. */
export interface RelationWhereResolverInput<
	TTarget extends SchemaDefinition = SchemaDefinition,
> {
	/** Carries the exact immutable context bound to the current operation. */
	readonly context: RequestContext
	/** Starts an immutable filter for the exact relation target. */
	readonly where: WhereBuilder<TTarget>
}

type RelationWhereResolverResult<TTarget extends SchemaDefinition> = (
	WhereBuilder<TTarget> | WhereInput<TTarget>
) & {
	/** Excludes PromiseLike values through Core's already-reserved model name. */
	readonly then?: never
}

/** Resolves one synchronous target filter for a relation read. */
export type RelationWhereResolver<
	TTarget extends SchemaDefinition = SchemaDefinition,
> = (
	input: RelationWhereResolverInput<TTarget>,
) => RelationWhereResolverResult<TTarget>

/** Accepts either one static target filter or one synchronous contextual resolver. */
export type RelationWhere<TTarget extends SchemaDefinition = SchemaDefinition> =
	RelationWhereResolver<TTarget> | WhereInput<TTarget>

interface StaticRelationWhereDeclaration {
	readonly input: Readonly<Record<string, unknown>>
	readonly kind: 'static'
}

interface ContextualRelationWhereDeclaration {
	readonly kind: 'contextual'
	readonly resolve: RelationWhereResolver
}

/** @internal Keeps executable relation shaping outside compiler-visible metadata. */
export type RelationWhereDeclaration =
	ContextualRelationWhereDeclaration | StaticRelationWhereDeclaration

/** Stores only stable adapter-neutral relation metadata. */
export interface RelationFieldMetadataOptions<
	TMappedBy extends string | undefined = string | undefined,
> {
	/**
	 * Documents the relationship for generators and developer tooling.
	 * @example `description: "Posts written by this user"`
	 */
	readonly description?: string
	/**
	 * Names the exact pointer or owning relation field that stores an inverse edge.
	 * @example `mappedBy: "author"`
	 */
	readonly mappedBy?: TMappedBy
}

/** Declares one transport-neutral to-many relationship. */
export interface RelationFieldOptions<
	TTarget extends SchemaDefinition = SchemaDefinition,
	TMappedBy extends RelationMappedFieldName<TTarget> | undefined =
		RelationMappedFieldName<TTarget> | undefined,
>
	extends
		RelationFieldMetadataOptions<TMappedBy>,
		FieldOptionValueCarrier<never> {
	/**
	 * Lazily returns the exact target schema after module declarations exist.
	 * @example `target: () => Post`
	 */
	readonly target: SchemaTarget<TTarget>
}

/** Carries one exact relation target without exposing an embedded collection value. */
export interface RelationField<
	TTarget extends SchemaDefinition = SchemaDefinition,
	TMappedBy extends string | undefined = string | undefined,
> extends FieldDefinition<
	'relation',
	never,
	RelationFieldMetadataOptions<TMappedBy>,
	RelationFieldTypeState
> {
	readonly [relationTargetMarker]?: TTarget
}

/** Accepts a target thunk (`() => Post`) or a schema class name. */
export type RelationTargetDeclaration = string | object

/**
 * Names the inverse field accepted by `mappedBy`. A thunk target is never read
 * while its schema is declared, so its `mappedBy` is checked at registration.
 */
export type RelationMappedByDeclaration<TTarget> = TTarget extends string
	? RelationMappedFieldName<SchemaReference<TTarget>>
	: string

type NamedRelationFieldOptions<
	TTarget extends RelationTargetDeclaration,
	TMappedBy extends RelationMappedByDeclaration<TTarget> | undefined,
> = Omit<
	RelationFieldOptions<DeclaredSchemaTarget<TTarget>, undefined>,
	'mappedBy' | 'target'
> & {
	/**
	 * Names the exact pointer or owning relation field that stores an inverse edge.
	 * @example `mappedBy: "author"`
	 */
	readonly mappedBy?: TMappedBy
	/**
	 * Lazily returns the target schema, or names a generated registry schema.
	 * @example `target: () => Post`
	 */
	readonly target: TTarget
}

/** Declares one application relation without introducing a value-level schema cycle. */
export type NamedRelationFieldBuilderMethod = <
	const TTarget extends RelationTargetDeclaration,
	const TMappedBy extends RelationMappedByDeclaration<TTarget> | undefined =
		undefined,
>(
	options: NamedRelationFieldOptions<TTarget, TMappedBy>,
) => RelationField<DeclaredSchemaTarget<TTarget>, TMappedBy>

const relationFieldOptionsContract: BuiltInFieldOptionsContract = {
	kind: 'relation',
	optionKeys: ['description', 'mappedBy', 'target'],
}

const snapshotRelationValue = (_value: unknown, path: string): never => {
	throw new TypeError(
		`${path} is a relation handle and cannot contain an embedded value`,
	)
}

const normalizeRelationMetadata = <TMappedBy extends string | undefined>(
	options: RelationFieldMetadataOptions<TMappedBy>,
): Readonly<RelationFieldMetadataOptions<TMappedBy>> => {
	if (
		options.description !== undefined &&
		typeof options.description !== 'string'
	) {
		throw new TypeError('description must be a string')
	}

	if (options.mappedBy !== undefined) {
		assertNonEmptyString(options.mappedBy, 'mappedBy')
	}

	return immutableRecord({
		...(options.description === undefined
			? {}
			: { description: options.description }),
		...(options.mappedBy === undefined ? {} : { mappedBy: options.mappedBy }),
	})
}

// Runtime checks what a resolver returns each time it calls it.
const isRelationWhereResolver = (
	value: unknown,
): value is RelationWhereResolver => typeof value === 'function'

/**
 * @internal Normalizes one filter of `plugins.relations(…)` (ADR-0328): a
 * static target filter is snapshotted, a resolver must be synchronous.
 */
export const normalizeRelationWhereDeclaration = (
	value: unknown,
	path: string,
): RelationWhereDeclaration => {
	if (isRelationWhereResolver(value)) {
		if (Object.prototype.toString.call(value) === '[object AsyncFunction]') {
			throw new TypeError(`${path} resolver must be synchronous`)
		}

		return immutableRecord({ kind: 'contextual' as const, resolve: value })
	}

	if (!isPlainRecord(value)) {
		throw new TypeError(
			`${path} must be a plain object or synchronous resolver`,
		)
	}

	const snapshot = snapshotCapturedOptionValue(value)
	assertPlainObject(snapshot, `${path} must be a plain object`)

	return immutableRecord({
		input: snapshot,
		kind: 'static' as const,
	})
}

/**
 * Declares an independently queryable to-many relationship.
 *
 * Omitting `mappedBy` creates the storage-owning side. Supplying it creates an
 * inverse side backed by the named pointer or owning relation on the target.
 *
 * @example
 * ```ts
 * relationField({ target: () => Tag })
 * relationField({ target: () => Post, mappedBy: 'author' })
 * ```
 */
export const relationField = <
	const TTarget extends SchemaDefinition,
	const TMappedBy extends RelationMappedFieldName<TTarget> | undefined =
		undefined,
>(
	options: RelationFieldOptions<TTarget, TMappedBy>,
): RelationField<TTarget, TMappedBy> => {
	assertFieldOptions(options)
	assertBuiltInFieldOptions(options, relationFieldOptionsContract)

	const { target, ...declarationOptions } = options

	if (typeof target !== 'function') {
		throw new TypeError('relationField target must be a function')
	}

	const normalizedMetadata = normalizeRelationMetadata(declarationOptions)
	const unresolvedOptions = immutableRecord(
		Object.fromEntries(
			Object.entries(declarationOptions).filter(
				([key]) => !relationFieldOptionsContract.optionKeys.includes(key),
			),
		),
	)

	return createFieldDefinition(
		'relation',
		immutableRecord({ ...normalizedMetadata, ...unresolvedOptions }),
		snapshotRelationValue,
		{
			optionsContract: relationFieldOptionsContract,
			schemaTarget: target,
		},
	)
}
