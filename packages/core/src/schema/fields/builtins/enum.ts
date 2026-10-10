import { immutableRecord, isUnknownArray } from '@ultimabase/shared'

import { createFieldDefinition } from '../base/definition.js'
import {
	assertFieldOptions,
	fieldOptionKeys,
	normalizeFieldOptions,
	type BuiltInFieldOptionsContract,
} from '../base/options.js'
import type {
	CompatibleFieldOptionsExtension,
	FieldDefinition,
	FieldTypegenState,
	FieldListOption,
	FieldOptions,
} from '../base/contract.js'
import {
	isSharedEnum,
	snapshotEnumValueList,
	type SharedEnum,
} from './shared-enum.js'
import {
	type CompactScalarFieldDefinition,
	type DefaultedCompactScalarFieldOptions,
	type NonDefaultedCompactScalarFieldOptions,
} from '../base/factory.js'

/**
 * The values of one enum field: a non-empty string array (a local enum,
 * named by generators from schema and field path) or a shared enum from
 * `defineEnum` (ADR-0310).
 */
export type EnumValues = readonly string[] | SharedEnum

/** Infers the persisted values of one enum source. */
export type EnumValue<TValues extends EnumValues> =
	TValues extends SharedEnum<string, infer TShared>
		? TShared[number]
		: TValues extends readonly string[]
			? TValues[number]
			: never

interface EnumValuesOption<TValues extends EnumValues> {
	/**
	 * Declares persisted values as a non-empty string array or a shared enum.
	 *
	 * @example `values: ["draft", "published"]`
	 * @example `values: TodoPriority // defineEnum('TodoPriority', [...])`
	 */
	readonly values: TValues
}

/**
 * Combines the exact enum source with field options constrained to its values.
 */
export interface EnumFieldOptions<TValues extends EnumValues = EnumValues>
	extends FieldOptions<EnumValue<TValues>>, EnumValuesOption<TValues> {}

/**
 * Carries the inferred string union and exact options through schema inference.
 */
export type EnumField<
	TValues extends EnumValues = EnumValues,
	TTypegen extends FieldTypegenState = FieldTypegenState,
> = FieldDefinition<
	'enum',
	EnumValue<TValues>,
	EnumFieldOptions<TValues>,
	TTypegen
>

const enumFieldOptionsContract: BuiltInFieldOptionsContract = {
	kind: 'enum',
	optionKeys: [...fieldOptionKeys, 'values'],
}

type NonEmptyMapping<TValues extends EnumValues> = TValues extends readonly []
	? never
	: TValues

export type CompatibleEnumFieldOptions<TValues extends EnumValues> =
	NonEmptyMapping<TValues> extends never ? { readonly values: never } : object

/** Preserves the enum domain while naming only operation-relevant options. */
type DefaultedEnumFieldOptions<
	TValues extends EnumValues,
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = DefaultedCompactScalarFieldOptions<
	EnumFieldOptions<TValues>,
	EnumValue<TValues>,
	TRequired,
	TList,
	TImmutable
> &
	CompatibleEnumFieldOptions<TValues>

type NonDefaultedEnumFieldOptions<
	TValues extends EnumValues,
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = NonDefaultedCompactScalarFieldOptions<
	EnumFieldOptions<TValues>,
	EnumValue<TValues>,
	TRequired,
	TList,
	TImmutable
> &
	CompatibleEnumFieldOptions<TValues>

type ResolvedEnumField<
	TValues extends EnumValues,
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	THasDefault extends boolean,
> = CompactScalarFieldDefinition<
	'enum',
	EnumValue<TValues>,
	EnumFieldOptions<TValues>,
	TRequired,
	TList,
	TImmutable,
	THasDefault
>

type DefaultedEnumField<
	TValues extends EnumValues,
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = ResolvedEnumField<TValues, TRequired, TList, TImmutable, true>

type NonDefaultedEnumField<
	TValues extends EnumValues,
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = ResolvedEnumField<TValues, TRequired, TList, TImmutable, false>

interface NormalizedEnumSource {
	readonly shared: SharedEnum | undefined
	readonly values: readonly string[]
}

const normalizeEnumValues = (source: unknown): NormalizedEnumSource => {
	if (isSharedEnum(source)) return { shared: source, values: source.values }
	if (!isUnknownArray(source)) {
		throw new TypeError(
			'Enum values must be a non-empty string array or a shared enum from defineEnum',
		)
	}
	return {
		shared: undefined,
		values: snapshotEnumValueList(source, 'Enum values'),
	}
}

/**
 * Declares a closed string domain from a string array or a shared enum.
 *
 * @example
 * ```ts
 * enumField({ values: ["draft", "published"], default: "draft" })
 * enumField({ values: defineEnum("ProductStatus", ["draft", "published"]) })
 * ```
 */
export function enumField<
	const TValues extends EnumValues,
	const TRequired extends boolean = false,
	const TList extends FieldListOption = false,
	const TImmutable extends boolean = false,
	const TExtensionOptions extends object = object,
>(
	options: CompatibleFieldOptionsExtension<
		DefaultedEnumFieldOptions<TValues, TRequired, TList, TImmutable>,
		TExtensionOptions,
		EnumValue<TValues>
	>,
): DefaultedEnumField<TValues, TRequired, TList, TImmutable>

export function enumField<
	const TValues extends EnumValues,
	const TRequired extends boolean = false,
	const TList extends FieldListOption = false,
	const TImmutable extends boolean = false,
	const TExtensionOptions extends object = object,
>(
	options: CompatibleFieldOptionsExtension<
		NonDefaultedEnumFieldOptions<TValues, TRequired, TList, TImmutable>,
		TExtensionOptions,
		EnumValue<TValues>
	>,
): NonDefaultedEnumField<TValues, TRequired, TList, TImmutable>

export function enumField(options: EnumFieldOptions): EnumField {
	assertFieldOptions(options)

	const { shared, values } = normalizeEnumValues(options.values)
	const snapshotValue = (value: unknown, path: string): string => {
		if (typeof value !== 'string' || !values.includes(value)) {
			const location = path === 'default' ? '' : ` at ${path}`

			throw new TypeError(`Invalid enum default${location}: ${String(value)}`)
		}

		return value
	}
	const normalized = normalizeFieldOptions(
		options,
		snapshotValue,
		enumFieldOptionsContract,
	)

	// Like object and pointer fields, enum fields record no Core options contract,
	// so application compilation keeps their unresolved option keys.
	// `values` is stored as the flat list every consumer reads; a shared enum
	// stays available as `sharedEnum` so generators emit one named type.
	return createFieldDefinition(
		'enum',
		immutableRecord({
			...normalized,
			values,
			...(shared === undefined ? {} : { sharedEnum: shared }),
		}),
		snapshotValue,
	)
}
