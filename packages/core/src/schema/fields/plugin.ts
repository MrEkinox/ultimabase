import { isPlainRecord } from '@ultimabase/shared'

import { createFieldDefinition } from './base/definition.js'
import { assertPluginFieldKind, type ReservedFieldKind } from './base/kinds.js'
import {
	normalizeFieldOptions,
	normalizeFlatValidation,
} from './base/options.js'
import type {
	FieldDefinition,
	FieldOptions,
	FieldValidationOptions,
	InvalidOptionsArguments,
	ValidatedFieldOptions,
} from './base/contract.js'
import type { FieldHookDeclaration } from '../hooks/field-contracts.js'
import { splitFieldDeclarationOptions } from '../hooks/field-declarations.js'

export type { ReservedFieldKind } from './base/kinds.js'

type AvailablePluginFieldKind<TKind extends string> =
	TKind extends ReservedFieldKind
		? never
		: TKind extends `${infer TNamespace}.${infer TName}`
			? TNamespace extends ''
				? never
				: TName extends ''
					? never
					: TKind
			: never

/** Removes declaration-only callbacks while retaining plugin-owned metadata. */
type PluginFieldMetadata<TOptions extends object> = Omit<TOptions, 'hooks'>

/**
 * Carries a namespaced plugin kind while retaining the regular field contract.
 */
export type PluginFieldDefinition<
	TKind extends string = string,
	TValue = unknown,
	TOptions extends object = FieldOptions<TValue>,
> = FieldDefinition<TKind, TValue, TOptions>

/**
 * Lets a plugin normalize its own constraints and scalar values through Schema.
 */
export interface PluginFieldNormalizers<
	TValue,
	TValidation extends FieldValidationOptions,
> {
	readonly normalizeValidation?: (
		validation: TValidation,
	) => Readonly<TValidation>
	readonly snapshotValue: (value: unknown, path: string) => TValue
}

/**
 * Creates a plugin-owned field while reusing common defaults, lists, and extensions.
 */
export const definePluginField = <
	TValue,
	const TKind extends string,
	TValidation extends FieldValidationOptions,
	const TOptions extends FieldOptions<TValue, TValidation>,
>(
	kind: AvailablePluginFieldKind<TKind>,
	options: TOptions &
		FieldHookDeclaration<
			PluginFieldDefinition<
				TKind,
				TValue,
				PluginFieldMetadata<NoInfer<TOptions>>
			>
		>,
	normalizers: PluginFieldNormalizers<TValue, TValidation>,
	...invalidOptions: InvalidOptionsArguments<
		ValidatedFieldOptions<NoInfer<TOptions>, TValue>
	>
): PluginFieldDefinition<TKind, TValue, PluginFieldMetadata<TOptions>> => {
	// The rest parameter keeps invalid plugin metadata out of the public call contract.
	void invalidOptions
	assertPluginFieldKind(kind, 'Plugin field kind')

	if (
		!isPlainRecord(normalizers) ||
		typeof normalizers.snapshotValue !== 'function'
	) {
		throw new TypeError('Plugin field snapshotValue must be a function')
	}

	if (
		normalizers.normalizeValidation !== undefined &&
		typeof normalizers.normalizeValidation !== 'function'
	) {
		throw new TypeError(
			'Plugin field normalizeValidation must be a function when provided',
		)
	}
	const { hooks, metadataOptions } = splitFieldDeclarationOptions<
		PluginFieldMetadata<TOptions> & FieldOptions<TValue, TValidation>
	>(options)
	const normalizedOptions = normalizeFieldOptions(
		metadataOptions,
		normalizers.normalizeValidation ?? normalizeFlatValidation,
		normalizers.snapshotValue,
	)

	return createFieldDefinition(
		kind,
		normalizedOptions,
		normalizers.snapshotValue,
		hooks,
	)
}
