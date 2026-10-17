import type {
	CompatibleFieldOptionsExtension,
	FieldDefinition,
	FieldIndexOption,
	FieldListOption,
	FieldOptions,
	FieldTypeState,
	ResolvedFieldSourceOptions,
	UniqueIndexedField,
} from '../base/contract.js'
import {
	createScalarFieldFactory,
	type CompactScalarFieldDefinition,
	type DefaultedCompactScalarFieldOptions,
	type NonDefaultedCompactScalarFieldOptions,
} from '../base/factory.js'
import { normalizeBooleanValue } from '../base/value.js'

/**
 * Describes boolean metadata through the common field contract.
 */
export type BooleanFieldOptions = FieldOptions<boolean>

/**
 * Carries the boolean value type and exact options through schema inference.
 */
export type BooleanField<TState extends FieldTypeState = FieldTypeState> =
	FieldDefinition<'boolean', boolean, BooleanFieldOptions, TState>

type DefaultedBooleanFieldOptions<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TIndexed extends FieldIndexOption,
> = DefaultedCompactScalarFieldOptions<
	BooleanFieldOptions,
	boolean,
	TRequired,
	TList,
	TImmutable,
	object,
	TIndexed
>

type NonDefaultedBooleanFieldOptions<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TIndexed extends FieldIndexOption,
> = NonDefaultedCompactScalarFieldOptions<
	BooleanFieldOptions,
	boolean,
	TRequired,
	TList,
	TImmutable,
	object,
	TIndexed
>

type ResolvedBooleanField<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	THasDefault extends boolean,
> = CompactScalarFieldDefinition<
	'boolean',
	boolean,
	BooleanFieldOptions,
	TRequired,
	TList,
	TImmutable,
	THasDefault
>

type DefaultedBooleanField<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = ResolvedBooleanField<TRequired, TList, TImmutable, true>

type NonDefaultedBooleanField<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = ResolvedBooleanField<TRequired, TList, TImmutable, false>

export interface BooleanFieldFactory<
	TSourceTemplate extends object = Readonly<Record<never, never>>,
> {
	<
		const TRequired extends boolean = true,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TIndexed extends FieldIndexOption = false,
		const TExtensionOptions extends object = object,
	>(
		options: CompatibleFieldOptionsExtension<
			DefaultedBooleanFieldOptions<TRequired, TList, TImmutable, TIndexed>,
			TExtensionOptions,
			boolean,
			ResolvedFieldSourceOptions<TSourceTemplate, boolean, TList, TRequired>
		>,
	): UniqueIndexedField<
		TIndexed,
		DefaultedBooleanField<TRequired, TList, TImmutable>
	>
	<
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TIndexed extends FieldIndexOption = false,
		const TExtensionOptions extends object = object,
	>(
		options?: CompatibleFieldOptionsExtension<
			NonDefaultedBooleanFieldOptions<TRequired, TList, TImmutable, TIndexed>,
			TExtensionOptions,
			boolean,
			ResolvedFieldSourceOptions<TSourceTemplate, boolean, TList, TRequired>
		>,
	): UniqueIndexedField<
		TIndexed,
		NonDefaultedBooleanField<TRequired, TList, TImmutable>
	>
}

/**
 * Declares a `true` or `false` value.
 *
 * @example
 * ```ts
 * booleanField({ default: false, indexed: true })
 * ```
 */
export const booleanField: BooleanFieldFactory = createScalarFieldFactory(
	'boolean',
	normalizeBooleanValue,
)
