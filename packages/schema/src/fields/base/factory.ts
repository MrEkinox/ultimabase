import type { FieldDefinition, ValidatedFieldOptions } from './contract.js'
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
		options: TDeclaredOptions &
			(ValidatedFieldOptions<NoInfer<TDeclaredOptions>, TValue> extends never
				? never
				: unknown),
	): FieldDefinition<TKind, TValue, TDeclaredOptions>
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
): ScalarFieldFactory<TKind, TValue, TOptions> => {
	function scalarField(): FieldDefinition<TKind, TValue, EmptyFieldOptions>
	function scalarField<const TDeclaredOptions extends TOptions>(
		options: TDeclaredOptions &
			(ValidatedFieldOptions<NoInfer<TDeclaredOptions>, TValue> extends never
				? never
				: unknown),
	): FieldDefinition<TKind, TValue, TDeclaredOptions>
	function scalarField(
		options?: TOptions,
	): FieldDefinition<TKind, TValue, EmptyFieldOptions | TOptions> {
		if (options === undefined) {
			return createFieldDefinition(kind, emptyFieldOptions, snapshotValue)
		}

		return createFieldDefinition(kind, normalizeOptions(options), snapshotValue)
	}

	return scalarField
}
