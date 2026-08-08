import { assertNonEmptyString, immutableRecord } from '@ultimabase/shared'

import type { AccessContext } from '../../../access/index.js'
import type {
	AccessDecisionRule,
	FieldFilterAccessKind,
	FieldValueAccessInput,
} from '../../access/contracts.js'
import {
	defineExtensions,
	type FieldExtension,
} from '../../extensions/definition.js'
import { createFieldDefinition } from '../base/definition.js'
import { assertFieldOptions } from '../base/options.js'
import { splitFieldDeclarationOptions } from '../../hooks/field-declarations.js'
import type { SchemaMutationKind } from '../../hooks/contracts.js'
import type { RelationMutationDelta } from '../../relations/mutation.js'
import type {
	FieldDefinition,
	FieldInferenceState,
	GenericField,
} from '../base/contract.js'
import type { SchemaDefinition } from '../../schema/definition.js'
import type { SchemaTarget } from '../../schema/targets.js'

declare const relationTargetMarker: unique symbol

/** Omits relation collections from ordinary row values and mutation inputs. */
export interface RelationFieldInferenceState extends FieldInferenceState {
	readonly create: 'forbidden'
	readonly object: 'forbidden'
	readonly update: 'forbidden'
	readonly nullable: false
	readonly list: false
}

type RelationshipField = GenericField & {
	readonly kind: 'pointer' | 'relation'
}

/** Selects target fields that can own one inverse relationship. */
export type RelationMappedFieldName<TTarget extends SchemaDefinition> = {
	[
		TFieldName in keyof TTarget['fields'] & string
	]: TTarget['fields'][TFieldName] extends RelationshipField
		? TFieldName
		: never
}[keyof TTarget['fields'] & string]

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

/** Supplies the protected source-field decision used by related reads. */
export interface RelationFieldReadAccessInput {
	readonly context: AccessContext
	readonly kind: FieldFilterAccessKind
}

/** Controls relation traversal and logical edge mutation independently. */
export interface RelationFieldAccess<TTarget extends SchemaDefinition> {
	/** Controls whether callers may traverse this related collection. */
	readonly read?: AccessDecisionRule<RelationFieldReadAccessInput>
	/** Controls one immutable connect, disconnect, set, or clear delta. */
	readonly update?: AccessDecisionRule<
		FieldValueAccessInput<
			RelationMutationDelta<TTarget>,
			Extract<SchemaMutationKind, 'update' | 'upsert'>
		>
	>
}

/** Declares one transport-neutral to-many relationship. */
export interface RelationFieldOptions<
	TTarget extends SchemaDefinition = SchemaDefinition,
	TMappedBy extends RelationMappedFieldName<TTarget> | undefined =
		RelationMappedFieldName<TTarget> | undefined,
> extends RelationFieldMetadataOptions<TMappedBy> {
	/**
	 * Declares relation traversal and mutation rules without exposing row values.
	 * @example `access: { read: true, update: ({ context }) => context.access.mode === "master" }`
	 */
	readonly access?: RelationFieldAccess<TTarget>
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
	RelationFieldInferenceState
> {
	readonly [relationTargetMarker]?: TTarget
}

const unsupportedRelationOptionKeys = [
	'default',
	'hooks',
	'immutable',
	'indexed',
	'list',
	'validation',
] as const
const relationOptionKeys = new Set([
	'access',
	'description',
	'extensions',
	'mappedBy',
	'target',
])

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

	for (const key of unsupportedRelationOptionKeys) {
		if (Object.hasOwn(options, key)) {
			throw new TypeError(`relationField does not support ${key}`)
		}
	}

	for (const key of Reflect.ownKeys(options)) {
		if (typeof key !== 'string' || !relationOptionKeys.has(key)) {
			throw new TypeError(`Unknown relationField option: ${String(key)}`)
		}
	}

	const { target, ...declarationOptions } = options

	if (typeof target !== 'function') {
		throw new TypeError('relationField target must be a function')
	}

	const { access, metadataOptions } =
		splitFieldDeclarationOptions<RelationFieldMetadataOptions<TMappedBy>>(
			declarationOptions,
		)

	return createFieldDefinition(
		'relation',
		normalizeRelationMetadata(metadataOptions),
		snapshotRelationValue,
		undefined,
		access,
		{ schemaTarget: target },
	)
}
