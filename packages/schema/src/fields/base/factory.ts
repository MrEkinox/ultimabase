import type {
	FieldDefinition,
	InvalidOptionsArguments,
	ValidatedFieldOptions,
} from './contract.js'
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

type ContextualScalarFieldOptions<
	TOptions extends object,
	TDeclaredOptions extends TOptions,
> = TOptions & TDeclaredOptions

/** Carries option-dependent construction behavior without exposing capabilities. */
export interface ScalarFieldConfiguration<TOptions extends object> {
	readonly normalizeOptions: ScalarFieldOptionsNormalizer<TOptions>
	readonly snapshotValue: ScalarValueSnapshot
}

export type ScalarFieldConfigurationResolver<TOptions extends object> = (
	options: TOptions | EmptyFieldOptions,
) => ScalarFieldConfiguration<TOptions>

/**
 * Preserves the common zero-argument and exact-option call contract shared by
 * scalar field factories.
 */
export interface ScalarFieldFactory<
	TKind extends string,
	TValue,
	TOptions extends object,
> {
	(): FieldDefinition<TKind, TValue, EmptyFieldOptions>
	<const TDeclaredOptions extends TOptions>(
		options: ContextualScalarFieldOptions<TOptions, TDeclaredOptions>,
		...invalidOptions: InvalidOptionsArguments<
			ValidatedFieldOptions<NoInfer<TDeclaredOptions>, TValue>
		>
	): FieldDefinition<TKind, TValue, TDeclaredOptions>
}

/**
 * Resolves construction behavior from declared options for scalar fields whose
 * snapshots depend on metadata such as timezone handling.
 */
export const createConfiguredScalarFieldFactory = <
	const TKind extends string,
	TValue,
	TOptions extends object,
>(
	kind: TKind,
	resolveConfiguration: ScalarFieldConfigurationResolver<TOptions>,
): ScalarFieldFactory<TKind, TValue, TOptions> => {
	function scalarField(): FieldDefinition<TKind, TValue, EmptyFieldOptions>
	function scalarField<const TDeclaredOptions extends TOptions>(
		options: ContextualScalarFieldOptions<TOptions, TDeclaredOptions>,
		...invalidOptions: InvalidOptionsArguments<
			ValidatedFieldOptions<NoInfer<TDeclaredOptions>, TValue>
		>
	): FieldDefinition<TKind, TValue, TDeclaredOptions>
	function scalarField(
		options?: TOptions,
		...invalidOptions: readonly never[]
	): FieldDefinition<TKind, TValue, EmptyFieldOptions | TOptions> {
		// The rest parameter exists only to keep invalid generic calls uncallable.
		void invalidOptions
		const declaredOptions = options ?? emptyFieldOptions
		const { normalizeOptions, snapshotValue } =
			resolveConfiguration(declaredOptions)

		if (options === undefined) {
			return createFieldDefinition(kind, emptyFieldOptions, snapshotValue)
		}

		return createFieldDefinition(kind, normalizeOptions(options), snapshotValue)
	}

	return scalarField
}

/**
 * Centralizes immutable field construction while each field retains ownership
 * of its specialized option and scalar-value normalization.
 */
export const createScalarFieldFactory = <
	const TKind extends string,
	TValue,
	TOptions extends object,
>(
	kind: TKind,
	normalizeOptions: ScalarFieldOptionsNormalizer<TOptions>,
	snapshotValue: ScalarValueSnapshot,
): ScalarFieldFactory<TKind, TValue, TOptions> =>
	createConfiguredScalarFieldFactory(kind, () => ({
		normalizeOptions,
		snapshotValue,
	}))
