import { assertNonEmptyString, immutableRecord } from '@ultimabase/shared'

import {
	defineExtensions,
	type FieldExtension,
} from '../../extensions/definition.js'
import { createFieldDefinition } from '../base/definition.js'
import {
	assertBuiltInFieldOptions,
	assertFieldOptions,
	type BuiltInFieldOptionsContract,
} from '../base/options.js'
import type {
	FieldDefinition,
	FieldOptionValueCarrier,
	FieldTypegenState,
} from '../base/contract.js'
import type { SchemaDefinition } from '../../schema/definition.js'
import type { SchemaReference } from '../../schema/definition.js'
import type { SchemaTarget } from '../../schema/targets.js'
import type {
	SchemaDeclarationTargetName,
	SchemaRelationshipFieldName,
} from '../../type-info.js'
import type { UltimaBaseGeneratedFieldOptions } from '../../type-info.js'

declare const relationTargetMarker: unique symbol

/** Omits relation collections from ordinary row values and mutation inputs. */
export interface RelationFieldTypegenState extends FieldTypegenState {
	readonly create: 'forbidden'
	readonly object: 'forbidden'
	readonly update: 'forbidden'
	readonly nullable: false
	readonly list: false
}

/** Selects target fields that can own one inverse relationship. */
export type RelationMappedFieldName<TTarget extends SchemaDefinition> =
	SchemaRelationshipFieldName<TTarget, 'pointer' | 'relation'>

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
	 * Attaches immutable plugin-owned metadata without changing relation semantics.
	 * @example `extensions: [auditRelation]`
	 */
	readonly extensions?: readonly FieldExtension<string, object>[]
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
		FieldOptionValueCarrier<never>,
		UltimaBaseGeneratedFieldOptions {
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
	RelationFieldTypegenState
> {
	readonly [relationTargetMarker]?: TTarget
}

type NamedRelationFieldOptions<
	TTargetName extends SchemaDeclarationTargetName,
	TMappedBy extends
		RelationMappedFieldName<SchemaReference<TTargetName>> | undefined,
> = Omit<
	RelationFieldOptions<SchemaReference<TTargetName>, TMappedBy>,
	'target'
> & {
	/** Names the target schema registered in the same application. */
	readonly target: TTargetName
}

/** Declares one application relation without introducing a value-level schema cycle. */
export type NamedRelationFieldBuilderMethod = <
	const TTargetName extends SchemaDeclarationTargetName,
	const TMappedBy extends
		RelationMappedFieldName<SchemaReference<TTargetName>> | undefined =
		undefined,
>(
	options: NamedRelationFieldOptions<TTargetName, TMappedBy>,
) => RelationField<SchemaReference<TTargetName>, TMappedBy>

const relationFieldOptionsContract: BuiltInFieldOptionsContract = {
	kind: 'relation',
	optionKeys: ['description', 'extensions', 'mappedBy', 'target'],
	validationOptionKeys: [],
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

	const extensions =
		options.extensions === undefined
			? undefined
			: defineExtensions(options.extensions)

	return immutableRecord({
		...(options.description === undefined
			? {}
			: { description: options.description }),
		...(extensions === undefined ? {} : { extensions }),
		...(options.mappedBy === undefined ? {} : { mappedBy: options.mappedBy }),
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
		{ optionsContract: relationFieldOptionsContract, schemaTarget: target },
	)
}
