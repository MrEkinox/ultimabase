import {
	type FieldOptionDefinition,
	type FieldOptionsValue,
	type PluginSourceFieldOption,
	type PluginSourceFieldOptionConstraint,
	type SchemaOptionRuntimeRequirement,
} from '@ultimabase/core'
import { definePluginFieldOption } from '@ultimabase/plugin-kit'

import {
	assertFieldStandardSchema,
	type CompatibleFieldStandardSchema,
	type FieldStandardSchema,
	type MutableFieldContainer,
} from './standard-schema.js'

/** Checks the exact inferred validator contract without adding Runtime behavior to Core. */
type FieldValidationCompatibility<TOptions extends object, TValue> = [
	TValue,
] extends [never]
	? false
	: TOptions extends { readonly validation: infer TSchema }
		? TSchema extends FieldStandardSchema
			? CompatibleFieldStandardSchema<
					TSchema,
					FieldOptionsValue<TValue, TOptions>,
					MutableFieldContainer<FieldOptionsValue<TValue, TOptions>>
				> extends never
				? false
				: true
			: false
		: true

interface SourceFieldValidationConstraint extends PluginSourceFieldOptionConstraint {
	readonly valid: FieldValidationCompatibility<this['options'], this['value']>
}

/** Resolves and validates Standard Schema from the exact source field value. */
type SourceFieldValidationOption = PluginSourceFieldOption<
	FieldStandardSchema,
	SourceFieldValidationConstraint
>

/** Owns the direct `validation` field option as an opaque executable artifact. */
export const fieldValidationOption: FieldOptionDefinition<
	FieldStandardSchema,
	SchemaOptionRuntimeRequirement,
	SourceFieldValidationOption
> = definePluginFieldOption({
	contexts: ['stored', 'embedded'],
	normalize: (value) => {
		assertFieldStandardSchema(value)
		return value
	},
	protocolVersion: 1,
	typegen: false,
	valueKind: 'opaque',
})
