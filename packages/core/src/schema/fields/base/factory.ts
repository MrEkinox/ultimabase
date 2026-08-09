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
import type { FieldHookDeclaration } from '../../hooks/field-contracts.js'
import { splitFieldDeclarationOptions } from '../../hooks/field-declarations.js'
import type { FieldAccessDeclaration } from '../../access/contracts.js'

type ScalarFieldOptionsNormalizer<TOptions extends object> = <
	const TDeclaredOptions extends TOptions,
>(
	options: TDeclaredOptions,
) => Readonly<TDeclaredOptions>

type CompactScalarFieldOptions<
	TOptions extends object,
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = TOptions & {
	readonly validation?: {
		readonly required?: TRequired
	}
} & {
	readonly list?: TList
	readonly immutable?: TImmutable
}

/** Names the complete input so editor hovers do not expand its intersections. */
export type DefaultedCompactScalarFieldOptions<
	TOptions extends object,
	TValue,
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TInferredOptions extends object = object,
> = CompactScalarFieldOptions<TOptions, TRequired, TList, TImmutable> &
	TInferredOptions & {
		readonly default: FieldDefault<FieldListValue<TValue, TList>>
	} & FieldHookDeclaration<
		NoInfer<
			FieldDefinition<
				'field',
				TValue,
				TOptions,
				ScalarFieldInferenceState<TRequired, TList, TImmutable, true>
			>
		>
	> &
	FieldAccessDeclaration<
		NoInfer<
			FieldDefinition<
				'field',
				TValue,
				TOptions,
				ScalarFieldInferenceState<TRequired, TList, TImmutable, true>
			>
		>
	>

/** Names the default-free input independently from the inferred field state. */
export type NonDefaultedCompactScalarFieldOptions<
	TOptions extends object,
	TValue,
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TInferredOptions extends object = object,
> = CompactScalarFieldOptions<TOptions, TRequired, TList, TImmutable> &
	TInferredOptions & { readonly default?: never } & FieldHookDeclaration<
		NoInfer<
			FieldDefinition<
				'field',
				TValue,
				TOptions,
				ScalarFieldInferenceState<TRequired, TList, TImmutable, false>
			>
		>
	> &
	FieldAccessDeclaration<
		NoInfer<
			FieldDefinition<
				'field',
				TValue,
				TOptions,
				ScalarFieldInferenceState<TRequired, TList, TImmutable, false>
			>
		>
	>

/** Resolves one scalar field's compact state for field-specific editor aliases. */
export type CompactScalarFieldDefinition<
	TKind extends string,
	TValue,
	TOptions extends FieldOptions<TValue>,
	TRequired extends boolean,
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

/** Retains an exact generation flag only when a composed field must inspect it. */
export type GeneratedScalarFieldOptions<
	TOptions extends object,
	TGenerationKey extends keyof TOptions,
	THasGeneratedValue extends boolean,
> = Omit<TOptions, TGenerationKey> &
	(boolean extends THasGeneratedValue
		? Readonly<Partial<Record<TGenerationKey, boolean>>>
		: THasGeneratedValue extends true
			? Readonly<Record<TGenerationKey, true>>
			: Readonly<Partial<Record<TGenerationKey, false>>>)

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
	THasGeneratedValue extends boolean,
	TList extends FieldListOption,
	THasDefault extends boolean,
	TExclusiveGeneration extends boolean,
> = CompatibleGeneratedValue<
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
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
	>(
		options: DefaultedCompactScalarFieldOptions<
			TOptions,
			TValue,
			TRequired,
			TList,
			TImmutable
		>,
	): FieldDefinition<
		TKind,
		TValue,
		TOptions,
		ScalarFieldInferenceState<TRequired, TList, TImmutable, true>
	>
	<
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
	>(
		options?: NonDefaultedCompactScalarFieldOptions<
			TOptions,
			TValue,
			TRequired,
			TList,
			TImmutable
		>,
	): FieldDefinition<
		TKind,
		TValue,
		TOptions,
		ScalarFieldInferenceState<TRequired, TList, TImmutable, false>
	>
}

/** Reuses compact scalar option inference for one name-first builder method. */
export interface CompactScalarFieldBuilderMethod<
	TValue,
	TOptions extends FieldOptions<TValue>,
> {
	/**
	 * Declares one scalar field with the existing factory options.
	 *
	 * @param name Stable logical field name within its containing schema or object.
	 * @param options Existing factory options, including validation, Access, and hooks.
	 * @example `field.string({ default: 'Untitled' })`
	 */
	<
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
	>(
		/** Stable logical field name within its containing schema or object. */
		name: string,
		/** Existing factory options, including validation, Access, and hooks. */
		options: DefaultedCompactScalarFieldOptions<
			TOptions,
			TValue,
			TRequired,
			TList,
			TImmutable
		>,
	): void
	/**
	 * Declares one scalar field without a default value.
	 *
	 * @param name Stable logical field name within its containing schema or object.
	 * @param options Existing factory options, including validation, Access, and hooks.
	 * @example `field.string()`
	 */
	<
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
	>(
		/** Stable logical field name within its containing schema or object. */
		name: string,
		/** Existing factory options, including validation, Access, and hooks. */
		options?: NonDefaultedCompactScalarFieldOptions<
			TOptions,
			TValue,
			TRequired,
			TList,
			TImmutable
		>,
	): void
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
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const THasGeneratedValue extends boolean = false,
	>(
		options: DefaultedCompactScalarFieldOptions<
			TOptions,
			TValue,
			TRequired,
			TList,
			TImmutable,
			GeneratedScalarOption<TGenerationKey, THasGeneratedValue>
		>,
		...invalidOptions: InvalidOptionsArguments<
			CompatibleGeneratedScalarOptions<
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
		TList,
		TImmutable,
		true,
		THasGeneratedValue
	>
	<
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const THasGeneratedValue extends boolean = false,
	>(
		options?: NonDefaultedCompactScalarFieldOptions<
			TOptions,
			TValue,
			TRequired,
			TList,
			TImmutable,
			GeneratedScalarOption<TGenerationKey, THasGeneratedValue>
		>,
		...invalidOptions: InvalidOptionsArguments<
			CompatibleGeneratedScalarOptions<
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
		TList,
		TImmutable,
		false,
		THasGeneratedValue
	>
}

/** Reuses generated scalar option inference for one name-first builder method. */
export interface GeneratedCompactScalarFieldBuilderMethod<
	TValue,
	TOptions extends FieldOptions<TValue>,
	TGenerationKey extends keyof TOptions & string,
	TExclusiveGeneration extends boolean,
> {
	/**
	 * Declares one generated-capable scalar field with an explicit default.
	 *
	 * @param name Stable logical field name within its containing schema or object.
	 * @param options Existing factory options, including validation, Access, and hooks.
	 * @example `field.int({ default: 0 })`
	 */
	<
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const THasGeneratedValue extends boolean = false,
	>(
		/** Stable logical field name within its containing schema or object. */
		name: string,
		/** Existing factory options, including validation, Access, and hooks. */
		options: DefaultedCompactScalarFieldOptions<
			TOptions,
			TValue,
			TRequired,
			TList,
			TImmutable,
			GeneratedScalarOption<TGenerationKey, THasGeneratedValue>
		>,
		...invalidOptions: InvalidOptionsArguments<
			CompatibleGeneratedScalarOptions<
				THasGeneratedValue,
				TList,
				true,
				TExclusiveGeneration
			>
		>
	): void
	/**
	 * Declares one generated-capable scalar field without an explicit default.
	 *
	 * @param name Stable logical field name within its containing schema or object.
	 * @param options Existing factory options, including validation, Access, and hooks.
	 * @example `field.int({ autoIncrement: true })`
	 */
	<
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const THasGeneratedValue extends boolean = false,
	>(
		/** Stable logical field name within its containing schema or object. */
		name: string,
		/** Existing factory options, including validation, Access, and hooks. */
		options?: NonDefaultedCompactScalarFieldOptions<
			TOptions,
			TValue,
			TRequired,
			TList,
			TImmutable,
			GeneratedScalarOption<TGenerationKey, THasGeneratedValue>
		>,
		...invalidOptions: InvalidOptionsArguments<
			CompatibleGeneratedScalarOptions<
				THasGeneratedValue,
				TList,
				false,
				TExclusiveGeneration
			>
		>
	): void
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

		if (options === undefined) {
			const { snapshotValue } = resolveConfiguration(emptyFieldOptions)

			return createFieldDefinition(kind, emptyFieldOptions, snapshotValue)
		}
		const { access, hooks, metadataOptions } =
			splitFieldDeclarationOptions<TOptions>(options)
		const { normalizeOptions, snapshotValue } =
			resolveConfiguration(metadataOptions)

		return createFieldDefinition(
			kind,
			normalizeOptions(metadataOptions),
			snapshotValue,
			hooks,
			access,
		)
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
