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
import { normalizeStringValue } from '../base/value.js'

/**
 * Describes storage-neutral UUID metadata through its canonical string value.
 */
export type UuidFieldOptions = FieldOptions<string>

/**
 * Carries the UUID value and exact options through schema inference.
 */
export type UuidField<TState extends FieldTypeState = FieldTypeState> =
	FieldDefinition<'uuid', string, UuidFieldOptions, TState>

type DefaultedUuidFieldOptions<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TIndexed extends FieldIndexOption,
> = DefaultedCompactScalarFieldOptions<
	UuidFieldOptions,
	string,
	TRequired,
	TList,
	TImmutable,
	object,
	TIndexed
>

type NonDefaultedUuidFieldOptions<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TIndexed extends FieldIndexOption,
> = NonDefaultedCompactScalarFieldOptions<
	UuidFieldOptions,
	string,
	TRequired,
	TList,
	TImmutable,
	object,
	TIndexed
>

type ResolvedUuidField<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	THasDefault extends boolean,
> = CompactScalarFieldDefinition<
	'uuid',
	string,
	UuidFieldOptions,
	TRequired,
	TList,
	TImmutable,
	THasDefault
>

type DefaultedUuidField<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = ResolvedUuidField<TRequired, TList, TImmutable, true>

type NonDefaultedUuidField<
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = ResolvedUuidField<TRequired, TList, TImmutable, false>

export interface UuidFieldFactory<
	TSourceTemplate extends object = Readonly<Record<never, never>>,
> {
	<
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TIndexed extends FieldIndexOption = false,
		const TExtensionOptions extends object = object,
	>(
		options: CompatibleFieldOptionsExtension<
			DefaultedUuidFieldOptions<TRequired, TList, TImmutable, TIndexed>,
			TExtensionOptions,
			string,
			ResolvedFieldSourceOptions<TSourceTemplate, string, TList, TRequired>
		>,
	): UniqueIndexedField<
		TIndexed,
		DefaultedUuidField<TRequired, TList, TImmutable>
	>
	<
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TIndexed extends FieldIndexOption = false,
		const TExtensionOptions extends object = object,
	>(
		options?: CompatibleFieldOptionsExtension<
			NonDefaultedUuidFieldOptions<TRequired, TList, TImmutable, TIndexed>,
			TExtensionOptions,
			string,
			ResolvedFieldSourceOptions<TSourceTemplate, string, TList, TRequired>
		>,
	): UniqueIndexedField<
		TIndexed,
		NonDefaultedUuidField<TRequired, TList, TImmutable>
	>
}

/**
 * Declares a canonical UUID string with portable field metadata.
 *
 * @example
 * ```ts
 * uuidField({ indexed: "unique", required: true })
 * ```
 */
export const uuidField: UuidFieldFactory = createScalarFieldFactory(
	'uuid',
	normalizeStringValue,
)
