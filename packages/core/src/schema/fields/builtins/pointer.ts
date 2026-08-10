import { immutableRecord } from '@ultimabase/shared'

import type { FieldAccessDeclaration } from '../../access/contracts.js'
import type { FieldHooks } from '../../hooks/field-contracts.js'
import { splitFieldDeclarationOptions } from '../../hooks/field-declarations.js'
import { snapshotPointerValue, type Pointer } from '../../relations/pointer.js'
import {
	Schema,
	type SchemaDefinition,
	type SchemaReference,
} from '../../schema/definition.js'
import type { SchemaTarget } from '../../schema/targets.js'
import type {
	SchemaRelationshipFieldName,
	SchemaRelationshipTargetName,
} from '../../type-info.js'
import type {
	FieldDefinition,
	FieldTypegenState,
	FieldOptionsBase,
	FieldValidationOptions,
	InvalidOptionsArguments,
	ScalarFieldTypegenState,
} from '../base/contract.js'
import { createFieldDefinition } from '../base/definition.js'
import {
	assertFieldOptions,
	normalizeFieldOptions,
	normalizeFlatValidation,
} from '../base/options.js'

/** Defines portable behavior when a referenced target object is deleted. */
export type PointerReferentialAction = 'restrict' | 'cascade' | 'setNull'

/** Keeps only stable logical pointer metadata visible to adapters. */
export interface PointerFieldMetadataOptions extends FieldOptionsBase<
	FieldValidationOptions,
	false
> {
	/** Applies the declared logical action when the target object is deleted. */
	readonly onDelete: PointerReferentialAction
}

/** Describes one typed pointer declaration without physical storage details. */
export interface PointerFieldOptions<
	TTarget extends SchemaDefinition = SchemaDefinition,
> extends FieldOptionsBase<FieldValidationOptions, false> {
	/**
	 * Keeps the scalar shape explicit; pointer collections use `relationField` instead.
	 *
	 * @example `list: false`
	 */
	readonly list?: false
	/**
	 * Lazily returns the exact target schema after all module declarations exist.
	 *
	 * @example `target: () => User`
	 */
	readonly target: SchemaTarget<TTarget>
	/**
	 * Selects target-deletion behavior. The safe default is `"restrict"`.
	 * `"setNull"` requires an optional pointer.
	 *
	 * @example `onDelete: "cascade"`
	 */
	readonly onDelete?: PointerReferentialAction
}

/** Carries one exact target schema through every operation-specific model. */
export type PointerField<
	TTarget extends SchemaDefinition = SchemaDefinition,
	TTypegen extends FieldTypegenState = FieldTypegenState,
> = FieldDefinition<
	'pointer',
	Pointer<TTarget>,
	PointerFieldMetadataOptions,
	TTypegen
>

/** Selects only top-level pointer fields declared by one exact schema. */
export type SchemaPointerFieldName<TSchema extends SchemaDefinition> =
	SchemaRelationshipFieldName<TSchema, 'pointer'>

/** Resolves the exact target schema retained by one pointer field. */
export type SchemaPointerTarget<
	TSchema extends SchemaDefinition,
	TFieldName extends SchemaPointerFieldName<TSchema>,
> =
	string extends SchemaRelationshipTargetName<TSchema, TFieldName>
		? SchemaDefinition
		: SchemaReference<SchemaRelationshipTargetName<TSchema, TFieldName>>

type ResolvedPointerField<
	TTarget extends SchemaDefinition,
	TRequired extends boolean,
	TImmutable extends boolean,
> = PointerField<
	TTarget,
	ScalarFieldTypegenState<TRequired, false, TImmutable, false>
>

/** Keeps presence literals inferable while preserving option-level editor help. */
interface CompactPointerValidationOptions<TRequired extends boolean> {
	/**
	 * Requires an explicit pointer during creation.
	 * @example `required: true`
	 */
	readonly required?: TRequired
}

type CompactPointerFieldOptions<
	TTarget extends SchemaDefinition,
	TRequired extends boolean,
	TImmutable extends boolean,
	TOnDelete extends PointerReferentialAction,
> = Omit<
	PointerFieldOptions<TTarget>,
	'immutable' | 'onDelete' | 'validation'
> & {
	/**
	 * Groups the pointer's required-presence rule.
	 * @example `validation: { required: true }`
	 */
	readonly validation?: CompactPointerValidationOptions<TRequired>
	/**
	 * Prevents replacement of the pointer after creation.
	 * @example `immutable: true`
	 */
	readonly immutable?: TImmutable
	/**
	 * Applies one logical target-deletion policy.
	 * @example `onDelete: "cascade"`
	 */
	readonly onDelete?: TOnDelete
} & {
	/**
	 * Declares pointer lifecycle hooks without allowing read-time identity rewrites.
	 * Use field Access to hide a pointer and target scalar hooks to resolve included values.
	 *
	 * @example `hooks: { validate: ({ value }) => value.id === "" ? [{ code: "pointer.empty", path: [], message: "Pointer id is required" }] : [] }`
	 */
	readonly hooks?: FieldHooks<
		ResolvedPointerField<
			NoInfer<TTarget>,
			NoInfer<TRequired>,
			NoInfer<TImmutable>
		>
	>
} & FieldAccessDeclaration<
		ResolvedPointerField<
			NoInfer<TTarget>,
			NoInfer<TRequired>,
			NoInfer<TImmutable>
		>
	>

type CompatiblePointerOptions<
	TRequired extends boolean,
	TOnDelete extends PointerReferentialAction,
> = TOnDelete extends 'setNull'
	? TRequired extends true
		? never
		: object
	: object

/**
 * Declares one exact lazy schema reference.
 *
 * @example `author: field.pointer({ target: () => User })`
 */
export type PointerFieldBuilderMethod = <
	const TTarget extends SchemaDefinition,
	const TRequired extends boolean = false,
	const TImmutable extends boolean = false,
	const TOnDelete extends PointerReferentialAction = 'restrict',
>(
	/** Stable logical field name within the containing schema. */
	name: string,
	/** Declares the exact lazy target and pointer behavior. */
	options: CompactPointerFieldOptions<
		TTarget,
		TRequired,
		TImmutable,
		TOnDelete
	>,
	...invalidOptions: InvalidOptionsArguments<
		CompatiblePointerOptions<TRequired, TOnDelete>
	>
) => void

interface PointerFieldMetadataInput extends FieldOptionsBase<
	FieldValidationOptions,
	false
> {
	readonly onDelete?: PointerReferentialAction
}

const pointerReferentialActions: ReadonlySet<PointerReferentialAction> =
	new Set(['restrict', 'cascade', 'setNull'])

const normalizePointerMetadata = (
	options: PointerFieldMetadataInput,
): Readonly<PointerFieldMetadataOptions> => {
	const declaredList: unknown = Reflect.get(options, 'list')

	if (declaredList !== undefined && declaredList !== false) {
		throw new TypeError('pointerField does not support list values')
	}

	const onDelete = options.onDelete ?? 'restrict'

	if (!pointerReferentialActions.has(onDelete)) {
		throw new TypeError('onDelete must be "restrict", "cascade", or "setNull"')
	}

	if (onDelete === 'setNull' && options.validation?.required === true) {
		throw new TypeError('onDelete "setNull" requires an optional pointer')
	}

	const normalized = normalizeFieldOptions(
		options,
		normalizeFlatValidation,
		snapshotPointerValue,
	)

	return immutableRecord({ ...normalized, onDelete })
}

/** Enforces the exact target schema whenever a pointer crosses a field boundary. */
const createPointerSnapshot =
	<const TTarget extends SchemaDefinition>(target: SchemaTarget<TTarget>) =>
	(value: unknown, path: string): Pointer<TTarget> => {
		const pointer = snapshotPointerValue(value, path)
		const expectedTarget = target()

		if (!Schema.is(expectedTarget)) {
			throw new TypeError(`${path} target must be created by Schema.define`)
		}

		if (pointer.schema !== expectedTarget) {
			throw new TypeError(`${path} must point to ${expectedTarget.className}`)
		}

		// Exact target identity is proven above at the only untyped field boundary.
		return pointer as Pointer<TTarget>
	}

/**
 * Declares one immutable reference to an object from an exact target schema.
 *
 * @example
 * ```ts
 * pointerField({
 *   target: () => User,
 *   validation: { required: true },
 *   indexed: true,
 * })
 * ```
 */
export function pointerField<
	const TTarget extends SchemaDefinition,
	const TRequired extends boolean = false,
	const TImmutable extends boolean = false,
	const TOnDelete extends PointerReferentialAction = 'restrict',
>(
	options: CompactPointerFieldOptions<
		TTarget,
		TRequired,
		TImmutable,
		TOnDelete
	>,
	...invalidOptions: InvalidOptionsArguments<
		CompatiblePointerOptions<TRequired, TOnDelete>
	>
): ResolvedPointerField<TTarget, TRequired, TImmutable>

export function pointerField<const TTarget extends SchemaDefinition>(
	options: PointerFieldOptions<TTarget>,
	...invalidOptions: readonly never[]
): PointerField<TTarget> {
	// The rest parameter exists only to reject contradictory generic options.
	void invalidOptions
	assertFieldOptions(options)

	if ('default' in options) {
		throw new TypeError('pointerField does not support default values')
	}
	const { target, ...declarationOptions } = options
	const { access, hooks, metadataOptions } =
		splitFieldDeclarationOptions<PointerFieldMetadataInput>(declarationOptions)
	const snapshotValue = createPointerSnapshot(target)

	return createFieldDefinition(
		'pointer',
		normalizePointerMetadata(metadataOptions),
		snapshotValue,
		hooks,
		access,
		{ schemaTarget: target },
	)
}
