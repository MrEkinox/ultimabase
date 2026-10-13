import type {
	FieldOptionsValue,
	PluginSourceFieldOption,
	PluginSourceFieldOptionConstraint,
} from '@ultimabase/core'
import {
	defineSchemaOption,
	type FieldOptionDefinition,
	type PluginSourceFieldApply,
	type PluginSourceFieldHKT,
	type SchemaOptionDefinition,
	type SchemaOptionRuntimeRequirement,
} from '@ultimabase/core/plugin'
import { definePluginFieldOption } from '@ultimabase/plugin-kit'

import { normalizeSchemaValidation } from './schema-validation.js'
import {
	assertValidator,
	type FieldStandardSchema,
	type FieldStandardSchemaCompatibility,
	type FieldValidator,
	type MutableFieldContainer,
} from './standard-schema.js'

/** Checks a Standard Schema validator against the exact field value (ADR-0319). */
type FieldValidationCompatibility<TOptions extends object, TValue> = [
	TValue,
] extends [never]
	? false
	: TOptions extends { readonly validation: infer TValidator }
		? TValidator extends FieldStandardSchema
			? FieldStandardSchemaCompatibility<
					TValidator,
					FieldOptionsValue<TValue, TOptions>,
					MutableFieldContainer<FieldOptionsValue<TValue, TOptions>>
				>
			: true
		: true

interface SourceFieldValidationConstraint extends PluginSourceFieldOptionConstraint {
	readonly valid: FieldValidationCompatibility<this['options'], this['value']>
}

/** Prints the `validation` option as `FieldValidator<string>`. */
export interface FieldValidatorHKT extends PluginSourceFieldHKT {
	readonly type: FieldValidator<this['value']>
}

/** Types `validation` from the exact source field value. */
type SourceFieldValidationOption = PluginSourceFieldOption<
	PluginSourceFieldApply<FieldValidatorHKT>,
	SourceFieldValidationConstraint
>

/** Owns the direct `validation` field option as an opaque executable artifact. */
export const fieldValidationOption: FieldOptionDefinition<
	unknown,
	SchemaOptionRuntimeRequirement,
	SourceFieldValidationOption
> = definePluginFieldOption({
	contexts: ['stored', 'embedded'],
	normalize: (value) => {
		assertValidator(value, 'validation')
		return value
	},
	protocolVersion: 1,
	valueKind: 'opaque',
})

/** Owns the schema `validation` rule (`.with({ validation })`) as an opaque value. */
export const schemaValidationOption: SchemaOptionDefinition =
	defineSchemaOption({
		normalize: normalizeSchemaValidation,
		protocolVersion: 1,
		valueKind: 'opaque',
	})
