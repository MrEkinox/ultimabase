import type {
	FieldDefinition,
	FieldListOption,
	FieldListValue,
	FieldOptions,
	InvalidOptionsArguments,
	ScalarFieldInferenceState,
} from './contract.js'
import type { FieldDefault } from './defaults.js'
import {
	createFieldDefinition,
	type ScalarValueSnapshot,
} from './definition.js'
import { emptyFieldOptions, type EmptyFieldOptions } from './options.js'

type ScalarFieldOptionsNormalizer<TOptions extends object> = <
	const TDeclaredOptions extends TOptions,
>(
	options: TDeclaredOptions,
) => Readonly<TDeclaredOptions>

type CompactScalarFieldOptions<
	TOptions extends object,
	TRequired extends boolean,
	TNullable extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = TOptions & {
	readonly validation?: {
		readonly required?: TRequired
		readonly nullable?: TNullable
	}
	readonly list?: TList
	readonly immutable?: TImmutable
}

/** Names the complete input so editor hovers do not expand its intersections. */
export type DefaultedCompactScalarFieldOptions<
	TOptions extends object,
	TValue,
	TRequired extends boolean,
	TNullable extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TInferredOptions extends object = object,
> = CompactScalarFieldOptions<
	TOptions,
	TRequired,
	TNullable,
	TList,
	TImmutable
> &
	TInferredOptions & {
		readonly default: FieldDefault<FieldListValue<TValue, TList>>
	}

/** Names the default-free input independently from the inferred field state. */
export type NonDefaultedCompactScalarFieldOptions<
	TOptions extends object,
	TRequired extends boolean,
	TNullable extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TInferredOptions extends object = object,
> = CompactScalarFieldOptions<
	TOptions,
	TRequired,
	TNullable,
	TList,
	TImmutable
> &
	TInferredOptions & { readonly default?: never }

export type CompatibleScalarPresence<
	TRequired extends boolean,
	TNullable extends boolean,
> = TRequired extends true ? (TNullable extends true ? never : object) : object

/** Resolves one scalar field's compact state for field-specific editor aliases. */
export type CompactScalarFieldDefinition<
	TKind extends string,
	TValue,
	TOptions extends FieldOptions<TValue>,
	TRequired extends boolean,
	TNullable extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	THasDefault extends boolean,
	THasGeneratedValue extends boolean = false,
> = FieldDefinition<
	TKind,
	TValue,
	TOptions,
	ScalarFieldInferenceState<
		TRequired,
		TNullable,
		TList,
		TImmutable,
		THasDefault,
		THasGeneratedValue
	>
>

export type GeneratedScalarOption<
	TGenerationKey extends PropertyKey,
	THasGeneratedValue extends boolean,
> = Readonly<Partial<Record<TGenerationKey, THasGeneratedValue>>>

type CompatibleGeneratedValue<
	THasGeneratedValue extends boolean,
	TList extends FieldListOption,
	THasDefault extends boolean,
	TExclusiveGeneration extends boolean,
> = TExclusiveGeneration extends true
	? THasGeneratedValue extends true
		? TList extends false
			? THasDefault extends true
				? never
				: object
			: never
		: object
	: object

export type CompatibleGeneratedScalarOptions<
	TRequired extends boolean,
	TNullable extends boolean,
	THasGeneratedValue extends boolean,
	TList extends FieldListOption,
	THasDefault extends boolean,
	TExclusiveGeneration extends boolean,
> = CompatibleScalarPresence<TRequired, TNullable> &
	CompatibleGeneratedValue<
		THasGeneratedValue,
		TList,
		THasDefault,
		TExclusiveGeneration
	>

/** Carries option-dependent construction behavior without exposing capabilities. */
export interface ScalarFieldConfiguration<TOptions extends object> {
	readonly normalizeOptions: ScalarFieldOptionsNormalizer<TOptions>
	readonly snapshotValue: ScalarValueSnapshot
}

export type ScalarFieldConfigurationResolver<TOptions extends object> = (
	options: TOptions | EmptyFieldOptions,
) => ScalarFieldConfiguration<TOptions>

/**
 * Keeps only operation-relevant scalar metadata in the returned field type.
 * Field-specific constraints stay contextually typed without becoming literals.
 */
export interface CompactScalarFieldFactory<
	TKind extends string,
	TValue,
	TOptions extends FieldOptions<TValue>,
> {
	<
		const TRequired extends boolean = false,
		const TNullable extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
	>(
		options: DefaultedCompactScalarFieldOptions<
			TOptions,
			TValue,
			TRequired,
			TNullable,
			TList,
			TImmutable
		>,
		...invalidOptions: InvalidOptionsArguments<
			CompatibleScalarPresence<TRequired, TNullable>
		>
	): FieldDefinition<
		TKind,
		TValue,
		TOptions,
		ScalarFieldInferenceState<TRequired, TNullable, TList, TImmutable, true>
	>
	<
		const TRequired extends boolean = false,
		const TNullable extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
	>(
		options?: NonDefaultedCompactScalarFieldOptions<
			TOptions,
			TRequired,
			TNullable,
			TList,
			TImmutable
		>,
		...invalidOptions: InvalidOptionsArguments<
			CompatibleScalarPresence<TRequired, TNullable>
		>
	): FieldDefinition<
		TKind,
		TValue,
		TOptions,
		ScalarFieldInferenceState<TRequired, TNullable, TList, TImmutable, false>
	>
}

/** Preserves one adapter-generated option in addition to common scalar state. */
export interface GeneratedCompactScalarFieldFactory<
	TKind extends string,
	TValue,
	TOptions extends FieldOptions<TValue>,
	TGenerationKey extends keyof TOptions & string,
	TExclusiveGeneration extends boolean,
> {
	<
		const TRequired extends boolean = false,
		const TNullable extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const THasGeneratedValue extends boolean = false,
	>(
		options: DefaultedCompactScalarFieldOptions<
			TOptions,
			TValue,
			TRequired,
			TNullable,
			TList,
			TImmutable,
			GeneratedScalarOption<TGenerationKey, THasGeneratedValue>
		>,
		...invalidOptions: InvalidOptionsArguments<
			CompatibleGeneratedScalarOptions<
				TRequired,
				TNullable,
				THasGeneratedValue,
				TList,
				true,
				TExclusiveGeneration
			>
		>
	): CompactScalarFieldDefinition<
		TKind,
		TValue,
		TOptions,
		TRequired,
		TNullable,
		TList,
		TImmutable,
		true,
		THasGeneratedValue
	>
	<
		const TRequired extends boolean = false,
		const TNullable extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const THasGeneratedValue extends boolean = false,
	>(
		options?: NonDefaultedCompactScalarFieldOptions<
			TOptions,
			TRequired,
			TNullable,
			TList,
			TImmutable,
			GeneratedScalarOption<TGenerationKey, THasGeneratedValue>
		>,
		...invalidOptions: InvalidOptionsArguments<
			CompatibleGeneratedScalarOptions<
				TRequired,
				TNullable,
				THasGeneratedValue,
				TList,
				false,
				TExclusiveGeneration
			>
		>
	): CompactScalarFieldDefinition<
		TKind,
		TValue,
		TOptions,
		TRequired,
		TNullable,
		TList,
		TImmutable,
		false,
		THasGeneratedValue
	>
}

/** Shares compact runtime construction across regular and generated contracts. */
const createCompactScalarFieldImplementation =
	<const TKind extends string, TValue, TOptions extends FieldOptions<TValue>>(
		kind: TKind,
		resolveConfiguration: ScalarFieldConfigurationResolver<TOptions>,
	): ((
		options?: TOptions,
		...invalidOptions: readonly never[]
	) => FieldDefinition<TKind, TValue, TOptions, never>) =>
	(options?: TOptions, ...invalidOptions: readonly never[]) => {
		// Invalid-option rest arguments exist only at the compile-time boundary.
		void invalidOptions
		const declaredOptions = options ?? emptyFieldOptions
		const { normalizeOptions, snapshotValue } =
			resolveConfiguration(declaredOptions)

		if (options === undefined) {
			return createFieldDefinition(kind, emptyFieldOptions, snapshotValue)
		}

		return createFieldDefinition(kind, normalizeOptions(options), snapshotValue)
	}

/** Creates the compact scalar contract without changing runtime field metadata. */
export const createCompactScalarFieldFactory = <
	const TKind extends string,
	TValue,
	TOptions extends FieldOptions<TValue>,
>(
	kind: TKind,
	normalizeOptions: ScalarFieldOptionsNormalizer<TOptions>,
	snapshotValue: ScalarValueSnapshot,
): CompactScalarFieldFactory<TKind, TValue, TOptions> =>
	createCompactScalarFieldImplementation(kind, () => ({
		normalizeOptions,
		snapshotValue,
	}))

/** Creates compact scalar inference for adapter-generated values. */
export const createGeneratedCompactScalarFieldFactory = <
	const TKind extends string,
	TValue,
	TOptions extends FieldOptions<TValue>,
	TGenerationKey extends keyof TOptions & string,
	TExclusiveGeneration extends boolean,
>(
	kind: TKind,
	normalizeOptions: ScalarFieldOptionsNormalizer<TOptions>,
	snapshotValue: ScalarValueSnapshot,
): GeneratedCompactScalarFieldFactory<
	TKind,
	TValue,
	TOptions,
	TGenerationKey,
	TExclusiveGeneration
> =>
	createCompactScalarFieldImplementation(kind, () => ({
		normalizeOptions,
		snapshotValue,
	}))

/** Resolves option-dependent snapshots for generated temporal scalar fields. */
export const createConfiguredGeneratedCompactScalarFieldFactory = <
	const TKind extends string,
	TValue,
	TOptions extends FieldOptions<TValue>,
	TGenerationKey extends keyof TOptions & string,
	TExclusiveGeneration extends boolean,
>(
	kind: TKind,
	resolveConfiguration: ScalarFieldConfigurationResolver<TOptions>,
): GeneratedCompactScalarFieldFactory<
	TKind,
	TValue,
	TOptions,
	TGenerationKey,
	TExclusiveGeneration
> => createCompactScalarFieldImplementation(kind, resolveConfiguration)
