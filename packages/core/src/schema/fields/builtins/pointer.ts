import { immutableRecord } from '@ultimabase/shared'

import { snapshotPointerValue, type Pointer } from '../../relations/pointer.js'
import {
	Schema,
	type SchemaDefinition,
	type SchemaReference,
} from '../../schema/definition.js'
import type { SchemaTarget } from '../../schema/targets.js'
import type { DeclaredSchemaTarget } from '../../schema/deferred-targets.js'
import type {
	SchemaDeclarationTargetName,
	SchemaRelationshipFieldName,
	SchemaRelationshipSource,
	SchemaRelationshipTargetName,
	SchemaTypeInfoSource,
} from '../../type-info.js'
import type {
	CompatibleFieldOptionsExtension,
	FieldDefinition,
	FieldTypegenState,
	FieldOptionsBase,
	ResolveFieldSourceTemplate,
	ScalarFieldTypegenState,
} from '../base/contract.js'
import { createFieldDefinition } from '../base/definition.js'
import {
	assertFieldOptions,
	fieldOptionsBaseKeys,
	normalizeFieldOptions,
	type BuiltInFieldOptionsContract,
} from '../base/options.js'

/** Defines portable behavior when a referenced target object is deleted. */
export type PointerReferentialAction = 'restrict' | 'cascade' | 'setNull'

/** Keeps only stable logical pointer metadata visible to adapters. */
export interface PointerFieldMetadataOptions extends FieldOptionsBase<
	false,
	Pointer
> {
	/** Applies the declared logical action when the target object is deleted. */
	readonly onDelete: PointerReferentialAction
}

/** Describes one typed pointer declaration without physical storage details. */
export interface PointerFieldOptions<
	TTarget extends SchemaDefinition = SchemaDefinition,
> extends FieldOptionsBase<false, Pointer<TTarget>> {
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

const pointerFieldOptionsContract: BuiltInFieldOptionsContract = {
	kind: 'pointer',
	optionKeys: [...fieldOptionsBaseKeys, 'onDelete'],
}

/** Selects only top-level pointer fields declared by one exact schema. */
export type SchemaPointerFieldName<TSchema extends SchemaTypeInfoSource> =
	SchemaRelationshipFieldName<TSchema, 'pointer'>

/** Resolves the exact target schema retained by one pointer field. */
export type SchemaPointerTarget<
	TSchema extends SchemaTypeInfoSource,
	TFieldName extends SchemaPointerFieldName<TSchema>,
> = [SchemaRelationshipSource<TSchema, TFieldName>] extends [never]
	? string extends SchemaRelationshipTargetName<TSchema, TFieldName>
		? SchemaDefinition
		: SchemaReference<SchemaRelationshipTargetName<TSchema, TFieldName>>
	: Extract<SchemaRelationshipSource<TSchema, TFieldName>, SchemaDefinition>

type ResolvedPointerField<
	TTarget extends SchemaDefinition,
	TRequired extends boolean,
	TImmutable extends boolean,
> = PointerField<
	TTarget,
	ScalarFieldTypegenState<TRequired, false, TImmutable, false>
>

type CompactPointerFieldOptions<
	TTarget extends SchemaDefinition,
	TRequired extends boolean,
	TImmutable extends boolean,
	TOnDelete extends PointerReferentialAction,
> = Omit<
	PointerFieldOptions<TTarget>,
	'immutable' | 'onDelete' | 'required'
> & {
	/**
	 * Requires an explicit non-null pointer during creation.
	 * @example `required: true`
	 */
	readonly required?: TRequired
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
}

type CompatiblePointerOptions<
	TRequired extends boolean,
	TOnDelete extends PointerReferentialAction,
> = TOnDelete extends 'setNull'
	? TRequired extends true
		? { readonly onDelete?: Exclude<PointerReferentialAction, 'setNull'> }
		: object
	: object

/** Names the statically compatible pointer input for concise editor signatures. */
type CompatibleCompactPointerFieldOptions<
	TTarget extends SchemaDefinition,
	TRequired extends boolean,
	TImmutable extends boolean,
	TOnDelete extends PointerReferentialAction,
> = CompactPointerFieldOptions<TTarget, TRequired, TImmutable, TOnDelete> &
	CompatiblePointerOptions<TRequired, TOnDelete>

/** Accepts a target thunk (`() => User`) or a generated registry name. */
export type PointerTargetDeclaration = SchemaDeclarationTargetName | object

type NamedCompactPointerFieldOptions<
	TTarget extends PointerTargetDeclaration,
	TRequired extends boolean,
	TImmutable extends boolean,
	TOnDelete extends PointerReferentialAction,
> = Omit<
	CompatibleCompactPointerFieldOptions<
		DeclaredSchemaTarget<TTarget>,
		TRequired,
		TImmutable,
		TOnDelete
	>,
	'target'
> & {
	/**
	 * Lazily returns the target schema, or names a generated registry schema.
	 * @example `target: () => User`
	 */
	// Non-generic here: plugin option extensions remap these options, and a
	// generic target there gives the thunk a contextual signature whose return
	// type TypeScript then evaluates while the schema is declared (TS7022).
	readonly target: PointerTargetDeclaration
}

/** Declares one application pointer without introducing a value-level schema cycle. */
export type NamedPointerFieldBuilderMethod<
	TSourceTemplate extends object = Readonly<Record<never, never>>,
> = <
	const TTarget extends PointerTargetDeclaration,
	const TRequired extends boolean = false,
	const TImmutable extends boolean = false,
	const TOnDelete extends PointerReferentialAction = PointerReferentialAction,
	const TExtensionOptions extends object = object,
>(
	options: CompatibleFieldOptionsExtension<
		NoInfer<
			NamedCompactPointerFieldOptions<TTarget, TRequired, TImmutable, TOnDelete>
		>,
		TExtensionOptions,
		Pointer<DeclaredSchemaTarget<TTarget>>,
		Extract<
			ResolveFieldSourceTemplate<
				TSourceTemplate,
				Pointer<DeclaredSchemaTarget<TTarget>>,
				TRequired extends true
					? Pointer<DeclaredSchemaTarget<TTarget>>
					: Pointer<DeclaredSchemaTarget<TTarget>> | null
			>,
			object
		>
	> &
		Readonly<{
			target: TTarget
			required?: TRequired
			immutable?: TImmutable
			onDelete?: TOnDelete
		}>,
) => ResolvedPointerField<DeclaredSchemaTarget<TTarget>, TRequired, TImmutable>

interface PointerFieldMetadataInput extends FieldOptionsBase<false, Pointer> {
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

	if (onDelete === 'setNull' && options.required === true) {
		throw new TypeError('onDelete "setNull" requires an optional pointer')
	}

	const normalized = normalizeFieldOptions(
		options,
		snapshotPointerValue,
		pointerFieldOptionsContract,
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
			throw new TypeError(`${path} target must be created by App.Schema.define`)
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
 *   required: true,
 *   indexed: true,
 * })
 * ```
 */
export function pointerField<
	const TTarget extends SchemaDefinition,
	const TRequired extends boolean = false,
	const TImmutable extends boolean = false,
	const TOnDelete extends PointerReferentialAction = PointerReferentialAction,
	const TExtensionOptions extends object = object,
>(
	options: CompatibleFieldOptionsExtension<
		CompatibleCompactPointerFieldOptions<
			TTarget,
			TRequired,
			TImmutable,
			TOnDelete
		>,
		TExtensionOptions,
		Pointer<TTarget>
	>,
): ResolvedPointerField<TTarget, TRequired, TImmutable>

export function pointerField<const TTarget extends SchemaDefinition>(
	options: PointerFieldOptions<TTarget>,
): PointerField<TTarget> {
	assertFieldOptions(options)

	if ('default' in options) {
		throw new TypeError('pointerField does not support default values')
	}
	const { target, ...declarationOptions } = options
	const snapshotValue = createPointerSnapshot(target)

	return createFieldDefinition(
		'pointer',
		normalizePointerMetadata(declarationOptions as PointerFieldMetadataInput),
		snapshotValue,
		{ schemaTarget: target },
	)
}
