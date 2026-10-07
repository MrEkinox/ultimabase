import type {
	CompatibleFieldOptionsExtension,
	FieldDefinition,
	FieldTypegenState,
	FieldListOption,
	FieldOptions,
	ResolvedFieldSourceOptions,
} from '../base/contract.js'
import {
	type CompactScalarField,
	createScalarFieldFactory,
	type DefaultedGeneratedScalarFieldOptions,
	type GeneratedScalarFieldOptions,
	type NonDefaultedGeneratedScalarFieldOptions,
	type ScalarFieldDescriptor,
} from '../base/factory.js'
import { assertAutoIncrementOption } from '../constraints/numeric.js'
import { normalizeSafeIntegerValue } from '../base/value.js'

/**
 * Adds integer-only sequence metadata to the common field contract.
 */
export interface IntFieldOptions extends FieldOptions<number> {
	/**
	 * Requests a database-generated sequence value from adapters that support it.
	 *
	 * @example `autoIncrement: true`
	 */
	readonly autoIncrement?: boolean
}

/**
 * Carries a safe integer and its exact options through schema inference.
 */
export type IntField<TTypegen extends FieldTypegenState = FieldTypegenState> =
	FieldDefinition<'int', number, IntFieldOptions, TTypegen>

/** Provides integer-specific names for compact sequence inference. */
type DefaultedIntFieldOptions<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TAutoIncrement extends boolean,
> = DefaultedGeneratedScalarFieldOptions<
	IntFieldOptions,
	number,
	TRequired,
	TList,
	TImmutable,
	'autoIncrement',
	TAutoIncrement,
	false
>

type NonDefaultedIntFieldOptions<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TAutoIncrement extends boolean,
> = NonDefaultedGeneratedScalarFieldOptions<
	IntFieldOptions,
	number,
	TRequired,
	TList,
	TImmutable,
	'autoIncrement',
	TAutoIncrement,
	false
>

type IntScalar<TAutoIncrement extends boolean> = ScalarFieldDescriptor<
	'int',
	number,
	GeneratedScalarFieldOptions<IntFieldOptions, 'autoIncrement', TAutoIncrement>
>

type DefaultedIntField<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TAutoIncrement extends boolean,
> = CompactScalarField<
	IntScalar<TAutoIncrement>,
	TRequired,
	TList,
	TImmutable,
	true,
	TAutoIncrement
>

type NonDefaultedIntField<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TAutoIncrement extends boolean,
> = CompactScalarField<
	IntScalar<TAutoIncrement>,
	TRequired,
	TList,
	TImmutable,
	false,
	TAutoIncrement
>

export interface IntFieldFactory<
	TSourceTemplate extends object = Readonly<Record<never, never>>,
> {
	<
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TAutoIncrement extends boolean = false,
		const TExtensionOptions extends object = object,
	>(
		options: CompatibleFieldOptionsExtension<
			DefaultedIntFieldOptions<TRequired, TList, TImmutable, TAutoIncrement>,
			TExtensionOptions,
			number,
			ResolvedFieldSourceOptions<TSourceTemplate, number, TList, TRequired>
		>,
	): DefaultedIntField<TRequired, TList, TImmutable, TAutoIncrement>
	<
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TAutoIncrement extends boolean = false,
		const TExtensionOptions extends object = object,
	>(
		options?: CompatibleFieldOptionsExtension<
			NonDefaultedIntFieldOptions<TRequired, TList, TImmutable, TAutoIncrement>,
			TExtensionOptions,
			number,
			ResolvedFieldSourceOptions<TSourceTemplate, number, TList, TRequired>
		>,
	): NonDefaultedIntField<TRequired, TList, TImmutable, TAutoIncrement>
}

/**
 * Declares a safe JavaScript integer between `Number.MIN_SAFE_INTEGER` and `Number.MAX_SAFE_INTEGER`.
 *
 * @example
 * ```ts
 * intField({ default: 0, indexed: true })
 * ```
 */
export const intField: IntFieldFactory = createScalarFieldFactory(
	'int',
	normalizeSafeIntegerValue,
	{
		optionKeys: ['autoIncrement'],
		assertOptions: assertAutoIncrementOption,
	},
)
