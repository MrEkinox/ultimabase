import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type {
	CompatibleFieldOptionsExtension,
	DefaultedFieldNonNull,
	FieldDefinition,
	FieldIndexOption,
	FieldListOption,
	FieldListValue,
	FieldOptions,
	ResolveFieldSourceTemplate,
	ScalarFieldTypeState,
} from './contract.js'
import type { FieldDefault } from './defaults.js'
import {
	createFieldDefinition,
	type ScalarValueSnapshot,
} from './definition.js'
import {
	assertFieldOptions,
	emptyFieldOptions,
	fieldOptionKeys,
	normalizeFieldOptions,
	type BuiltInFieldOptionsContract,
} from './options.js'

type CompactScalarFieldOptions<
	TOptions extends object,
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TIndexed extends FieldIndexOption,
> = Omit<TOptions, 'immutable' | 'indexed' | 'list' | 'nullable' | 'required'> &
	// Embedded fields have no `indexed` option.
	('indexed' extends keyof TOptions
		? IndexedFieldOption<TIndexed>
		: unknown) & {
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

/** The exact `indexed` option of a stored field, inferred for unique targets. */
export interface IndexedFieldOption<TIndexed extends FieldIndexOption> {
	/**
	 * Requests a regular index with `true`, a unique index with `"unique"`, or
	 * no index with `false`. A unique field alone identifies one row in
	 * `updateOne`, `deleteOne` and `upsertOne` (ADR-0332).
	 *
	 * @example `indexed: "unique"`
	 */
	readonly indexed?: TIndexed
}

/**
 * Names the complete input so editor hovers do not expand its intersections.
 * A default makes the field non-null unless it declares `nullable: true`, so
 * `required` adds nothing beside it and cannot be combined with `nullable`
 * (ADR-0340).
 */
export type DefaultedCompactScalarFieldOptions<
	TOptions extends object,
	TValue,
	TNullable extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TInferredOptions extends object = object,
	TIndexed extends FieldIndexOption = FieldIndexOption,
> = CompactScalarFieldOptions<
	TOptions,
	TNullable extends true ? false : boolean,
	TList,
	TImmutable,
	TIndexed
> &
	TInferredOptions & {
		readonly default: FieldDefault<FieldListValue<TValue, TList>>
		/**
		 * Lets the defaulted field hold `null`: an omitted value still gets the
		 * default, and explicit `null` is kept.
		 * @example `nullable: true`
		 */
		readonly nullable?: TNullable
	}

/** Names the default-free input independently from the inferred field state. */
export type NonDefaultedCompactScalarFieldOptions<
	TOptions extends FieldOptions<TValue>,
	TValue,
	TRequired extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TInferredOptions extends object = object,
	TIndexed extends FieldIndexOption = FieldIndexOption,
> = CompactScalarFieldOptions<
	TOptions,
	TRequired,
	TList,
	TImmutable,
	TIndexed
> &
	TInferredOptions & {
		readonly default?: never
		/**
		 * Accepted only beside a `default`: without one, a field that is not
		 * `required` is already nullable.
		 * @example `default: false, nullable: true`
		 */
		readonly nullable?: never
	}

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
	ScalarFieldTypeState<
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
	TNullable extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	TGenerationKey extends PropertyKey,
	THasGeneratedValue extends boolean,
	TExclusiveGeneration extends boolean,
> = DefaultedCompactScalarFieldOptions<
	TOptions,
	TValue,
	TNullable,
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
		const TNullable extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const TExtensionOptions extends object = object,
	>(
		options: CompatibleFieldOptionsExtension<
			DefaultedCompactScalarFieldOptions<
				TOptions,
				TValue,
				TNullable,
				TList,
				TImmutable
			>,
			TExtensionOptions,
			TValue,
			Extract<
				ResolveFieldSourceTemplate<
					TSourceTemplate,
					FieldListValue<TValue, TList>,
					TNullable extends true
						? FieldListValue<TValue, TList> | null
						: FieldListValue<TValue, TList>
				>,
				object
			>
		>,
	): FieldDefinition<
		TKind,
		TValue,
		TOptions & TExtensionOptions,
		ScalarFieldTypeState<
			DefaultedFieldNonNull<TNullable>,
			TList,
			TImmutable,
			true
		>
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
					FieldListValue<TValue, TList>,
					TRequired extends true
						? FieldListValue<TValue, TList>
						: FieldListValue<TValue, TList> | null
				>,
				object
			>
		>,
	): FieldDefinition<
		TKind,
		TValue,
		TOptions & TExtensionOptions,
		ScalarFieldTypeState<TRequired, TList, TImmutable, false>
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
		const TNullable extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
		const THasGeneratedValue extends boolean = false,
		const TExtensionOptions extends object = object,
	>(
		options: CompatibleFieldOptionsExtension<
			DefaultedGeneratedScalarFieldOptions<
				TOptions,
				TValue,
				TNullable,
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
					FieldListValue<TValue, TList>,
					TNullable extends true
						? FieldListValue<TValue, TList> | null
						: FieldListValue<TValue, TList>
				>,
				object
			>
		>,
	): CompactScalarFieldDefinition<
		TKind,
		TValue,
		TOptions & TExtensionOptions,
		DefaultedFieldNonNull<TNullable>,
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
					FieldListValue<TValue, TList>,
					TRequired extends true
						? FieldListValue<TValue, TList>
						: FieldListValue<TValue, TList> | null
				>,
				object
			>
		>,
	): CompactScalarFieldDefinition<
		TKind,
		TValue,
		TOptions & TExtensionOptions,
		TRequired,
		TList,
		TImmutable,
		false,
		THasGeneratedValue
	>
}

/**
 * Narrows the shared snapshot boundary to one scalar's logical value. Reusing
 * the definition contract also keeps the bundled declaration module order (and
 * so the reference's private alias names) unchanged.
 */
type TypedScalarValueSnapshot<TValue> = ScalarValueSnapshot &
	((value: unknown, path: string) => TValue)

/** Describes how one compact built-in scalar validates options beyond common metadata. */
export interface ScalarFieldSpec<TValue> {
	/** Lists root option names owned in addition to the common value-field keys. */
	readonly optionKeys?: readonly string[]
	/** Validates kind-specific options before common metadata is normalized. */
	readonly assertOptions?: (options: Readonly<Record<string, unknown>>) => void
	/** Derives an option-dependent snapshot, such as a timezone-aware normalizer. */
	readonly resolveSnapshot?: (
		options: Readonly<Record<string, unknown>>,
	) => TypedScalarValueSnapshot<TValue>
}

/**
 * Creates the runtime shared by every compact scalar factory. Built-ins annotate
 * the result with their named overload interface so editor hovers stay concise;
 * the snapshot governs both static defaults and later value boundaries.
 */
export const createScalarFieldFactory = <const TKind extends string, TValue>(
	kind: TKind,
	snapshotValue: TypedScalarValueSnapshot<TValue>,
	{
		optionKeys = [],
		assertOptions,
		resolveSnapshot,
	}: ScalarFieldSpec<TValue> = {},
): ((
	options?: object,
) => FieldDefinition<TKind, TValue, FieldOptions<TValue>, never>) => {
	const optionsContract: BuiltInFieldOptionsContract = immutableRecord({
		kind,
		optionKeys: immutableArray([...fieldOptionKeys, ...optionKeys]),
	})

	return (options) => {
		// Zero-argument fields share one empty option record without a contract.
		if (options === undefined) {
			return createFieldDefinition(kind, emptyFieldOptions, snapshotValue)
		}

		assertFieldOptions(options)
		assertOptions?.(options)

		const snapshot = resolveSnapshot?.(options) ?? snapshotValue

		return createFieldDefinition(
			kind,
			normalizeFieldOptions(options, snapshot, optionsContract),
			snapshot,
			{ optionsContract },
		)
	}
}
