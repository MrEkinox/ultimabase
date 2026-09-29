import type {
	CompatibleFieldOptionsExtension,
	FieldDefinition,
	FieldListOption,
	FieldListValue,
	FieldOptions,
	ResolveFieldSourceTemplate,
	ScalarFieldTypegenState,
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
	TList extends FieldListOption,
	TImmutable extends boolean,
> = Omit<TOptions, 'immutable' | 'list' | 'required'> & {
	/**
	 * Requires a non-null persisted value and requires create input unless a
	 * default or generator supplies it.
	 * @example `required: true`
	 */
	readonly required?: TRequired
	/**
	 * Wraps the scalar in one homogeneous list when enabled.
	 * @example `list: true`
	 */
	readonly list?: TList
	/**
	 * Prevents the field from appearing in update inputs after creation.
	 * @example `immutable: true`
	 */
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
	}

/** Names the default-free input independently from the inferred field state. */
export type NonDefaultedCompactScalarFieldOptions<
	TOptions extends FieldOptions<TValue>,
	TValue,
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TInferredOptions extends object = object,
> = CompactScalarFieldOptions<TOptions, TRequired, TList, TImmutable> &
	TInferredOptions & { readonly default?: never }

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
	ScalarFieldTypegenState<
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

/** Projects an invalid generated-value combination onto its conflicting option. */
export type CompatibleGeneratedScalarOptions<
	TGenerationKey extends PropertyKey,
	THasGeneratedValue extends boolean,
	TList extends FieldListOption,
	THasDefault extends boolean,
	TExclusiveGeneration extends boolean,
> =
	CompatibleGeneratedValue<
		THasGeneratedValue,
		TList,
		THasDefault,
		TExclusiveGeneration
	> extends never
		? THasDefault extends true
			? Readonly<Partial<Record<TGenerationKey, false>>>
			: { readonly list?: false }
		: object

/** Names a generated scalar input with a default so editor signatures stay compact. */
type DefaultedGeneratedScalarFieldOptions<
	TOptions extends object,
	TValue,
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TGenerationKey extends PropertyKey,
	THasGeneratedValue extends boolean,
	TExclusiveGeneration extends boolean,
> = DefaultedCompactScalarFieldOptions<
	TOptions,
	TValue,
	TRequired,
	TList,
	TImmutable,
	GeneratedScalarOption<TGenerationKey, THasGeneratedValue>
> &
	CompatibleGeneratedScalarOptions<
		TGenerationKey,
		THasGeneratedValue,
		TList,
		true,
		TExclusiveGeneration
	>

/** Names a generated scalar input without a default for concise editor signatures. */
type NonDefaultedGeneratedScalarFieldOptions<
	TOptions extends object,
	TValue,
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TGenerationKey extends PropertyKey,
	THasGeneratedValue extends boolean,
	TExclusiveGeneration extends boolean,
> = NonDefaultedCompactScalarFieldOptions<
	TOptions,
	TValue,
	TRequired,
	TList,
	TImmutable,
	GeneratedScalarOption<TGenerationKey, THasGeneratedValue>
> &
	CompatibleGeneratedScalarOptions<
		TGenerationKey,
		THasGeneratedValue,
		TList,
		false,
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
 * Keeps operation metadata compact; built-ins retain named callable aliases
 * because TypeScript surfaces those names in source and compiled editor hovers.
 */
export interface CompactScalarFieldFactory<
	TKind extends string,
	TValue,
	TOptions extends FieldOptions<TValue>,
	TSourceTemplate extends object = Readonly<Record<never, never>>,
> {
	<
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TExtensionOptions extends object = object,
	>(
		options: CompatibleFieldOptionsExtension<
			DefaultedCompactScalarFieldOptions<
				TOptions,
				TValue,
				TRequired,
				TList,
				TImmutable
			>,
			TExtensionOptions,
			TValue,
			Extract<
				ResolveFieldSourceTemplate<
					TSourceTemplate,
					FieldListValue<TValue, TList>
				>,
				object
			>
		>,
	): FieldDefinition<
		TKind,
		TValue,
		TOptions,
		ScalarFieldTypegenState<TRequired, TList, TImmutable, true>
	>
	<
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TExtensionOptions extends object = object,
	>(
		options?: CompatibleFieldOptionsExtension<
			NonDefaultedCompactScalarFieldOptions<
				TOptions,
				TValue,
				TRequired,
				TList,
				TImmutable
			>,
			TExtensionOptions,
			TValue,
			Extract<
				ResolveFieldSourceTemplate<
					TSourceTemplate,
					FieldListValue<TValue, TList>
				>,
				object
			>
		>,
	): FieldDefinition<
		TKind,
		TValue,
		TOptions,
		ScalarFieldTypegenState<TRequired, TList, TImmutable, false>
	>
}

/** Preserves one adapter-generated option in addition to common scalar state. */
export interface GeneratedCompactScalarFieldFactory<
	TKind extends string,
	TValue,
	TOptions extends FieldOptions<TValue>,
	TGenerationKey extends keyof TOptions & string,
	TExclusiveGeneration extends boolean,
	TSourceTemplate extends object = Readonly<Record<never, never>>,
> {
	<
		const TRequired extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const THasGeneratedValue extends boolean = false,
		const TExtensionOptions extends object = object,
	>(
		options: CompatibleFieldOptionsExtension<
			DefaultedGeneratedScalarFieldOptions<
				TOptions,
				TValue,
				TRequired,
				TList,
				TImmutable,
				TGenerationKey,
				THasGeneratedValue,
				TExclusiveGeneration
			>,
			TExtensionOptions,
			TValue,
			Extract<
				ResolveFieldSourceTemplate<
					TSourceTemplate,
					FieldListValue<TValue, TList>
				>,
				object
			>
		>,
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
		const TExtensionOptions extends object = object,
	>(
		options?: CompatibleFieldOptionsExtension<
			NonDefaultedGeneratedScalarFieldOptions<
				TOptions,
				TValue,
				TRequired,
				TList,
				TImmutable,
				TGenerationKey,
				THasGeneratedValue,
				TExclusiveGeneration
			>,
			TExtensionOptions,
			TValue,
			Extract<
				ResolveFieldSourceTemplate<
					TSourceTemplate,
					FieldListValue<TValue, TList>
				>,
				object
			>
		>,
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

/** Shares compact runtime construction across regular and generated contracts. */
const createCompactScalarFieldImplementation =
	<const TKind extends string, TValue, TOptions extends FieldOptions<TValue>>(
		kind: TKind,
		resolveConfiguration: ScalarFieldConfigurationResolver<TOptions>,
	): ((options?: object) => FieldDefinition<TKind, TValue, TOptions, never>) =>
	(options?: object) => {
		if (options === undefined) {
			const { snapshotValue } = resolveConfiguration(emptyFieldOptions)

			return createFieldDefinition(kind, emptyFieldOptions, snapshotValue)
		}
		const declaredOptions = options as TOptions
		const { normalizeOptions, snapshotValue } =
			resolveConfiguration(declaredOptions)

		return createFieldDefinition(
			kind,
			normalizeOptions(declaredOptions),
			snapshotValue,
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
