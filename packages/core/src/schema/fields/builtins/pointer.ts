import { immutableRecord } from '@ultimabase/shared'

import type { FieldAccessDeclaration } from '../../access/contracts.js'
import type { FieldHookDeclaration } from '../../hooks/field-contracts.js'
import { splitFieldDeclarationOptions } from '../../hooks/field-declarations.js'
import { snapshotPointerValue, type Pointer } from '../../relations/pointer.js'
import { Schema, type SchemaDefinition } from '../../schema/definition.js'
import type { SchemaTarget } from '../../schema/targets.js'
import type {
	FieldDefinition,
	FieldInferenceState,
	FieldOptionsBase,
	FieldValidationOptions,
	InvalidOptionsArguments,
	ScalarFieldInferenceState,
} from '../base/contract.js'
import { createFieldDefinition } from '../base/definition.js'
import type { CompatibleScalarPresence } from '../base/factory.js'
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
	 * `"setNull"` requires `validation.nullable: true`.
	 *
	 * @example `onDelete: "cascade"`
	 */
	readonly onDelete?: PointerReferentialAction
}

/** Carries one exact target schema through every operation-specific model. */
export type PointerField<
	TTarget extends SchemaDefinition = SchemaDefinition,
	TInference extends FieldInferenceState = FieldInferenceState,
> = FieldDefinition<
	'pointer',
	Pointer<TTarget>,
	PointerFieldMetadataOptions,
	TInference
>

type ResolvedPointerField<
	TTarget extends SchemaDefinition,
	TRequired extends boolean,
	TNullable extends boolean,
	TImmutable extends boolean,
> = PointerField<
	TTarget,
	ScalarFieldInferenceState<TRequired, TNullable, false, TImmutable, false>
>

/** Keeps presence literals inferable while preserving option-level editor help. */
interface CompactPointerValidationOptions<
	TRequired extends boolean,
	TNullable extends boolean,
> {
	/**
	 * Requires an explicit pointer during creation.
	 * @example `required: true`
	 */
	readonly required?: TRequired
	/**
	 * Allows the pointer value to be explicitly `null`.
	 * @example `nullable: true`
	 */
	readonly nullable?: TNullable
}

type CompactPointerFieldOptions<
	TTarget extends SchemaDefinition,
	TRequired extends boolean,
	TNullable extends boolean,
	TImmutable extends boolean,
	TOnDelete extends PointerReferentialAction,
> = Omit<
	PointerFieldOptions<TTarget>,
	'immutable' | 'onDelete' | 'validation'
> & {
	/**
	 * Groups pointer presence rules enforced by Runtime.
	 * @example `validation: { required: true }`
	 */
	readonly validation?: CompactPointerValidationOptions<TRequired, TNullable>
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
} & FieldHookDeclaration<
		ResolvedPointerField<TTarget, TRequired, TNullable, TImmutable>
	> &
	FieldAccessDeclaration<
		ResolvedPointerField<TTarget, TRequired, TNullable, TImmutable>
	>

type CompatiblePointerOptions<
	TRequired extends boolean,
	TNullable extends boolean,
	TOnDelete extends PointerReferentialAction,
> = CompatibleScalarPresence<TRequired, TNullable> &
	(TOnDelete extends 'setNull'
		? TNullable extends true
			? object
			: never
		: object)

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

	if (onDelete === 'setNull' && options.validation?.nullable !== true) {
		throw new TypeError(
			'onDelete "setNull" requires validation.nullable to be true',
		)
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
	(target: SchemaTarget) =>
	(value: unknown, path: string): Pointer => {
		const pointer = snapshotPointerValue(value, path)
		const expectedTarget = target()

		if (!Schema.is(expectedTarget)) {
			throw new TypeError(`${path} target must be created by Schema.define`)
		}

		if (pointer.schema !== expectedTarget) {
			throw new TypeError(`${path} must point to ${expectedTarget.className}`)
		}

		return pointer
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
	const TNullable extends boolean = false,
	const TImmutable extends boolean = false,
	const TOnDelete extends PointerReferentialAction = 'restrict',
>(
	options: CompactPointerFieldOptions<
		TTarget,
		TRequired,
		TNullable,
		TImmutable,
		TOnDelete
	>,
	...invalidOptions: InvalidOptionsArguments<
		CompatiblePointerOptions<TRequired, TNullable, TOnDelete>
	>
): ResolvedPointerField<TTarget, TRequired, TNullable, TImmutable>

export function pointerField(
	options: PointerFieldOptions,
	...invalidOptions: readonly never[]
): PointerField {
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
