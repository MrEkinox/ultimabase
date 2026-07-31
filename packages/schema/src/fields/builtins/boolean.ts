import {
	normalizeFieldOptions,
	normalizeFlatValidation,
} from '../base/options.js'
import type {
	FieldDefinition,
	FieldOptions,
	FieldValidationOptions,
} from '../base/contract.js'
import {
	createScalarFieldFactory,
	type ScalarFieldFactory,
} from '../base/factory.js'
import { normalizeBooleanValue } from '../base/value.js'

/**
 * Names the presence-only validation contract exposed by boolean fields.
 */
export type BooleanValidationOptions = FieldValidationOptions

/**
 * Describes boolean metadata through the common field contract.
 */
export type BooleanFieldOptions = FieldOptions<boolean>

/**
 * Carries the boolean value type and exact options through schema inference.
 */
export type BooleanField<
	TOptions extends BooleanFieldOptions = BooleanFieldOptions,
> = FieldDefinition<'boolean', boolean, TOptions>

const normalizeBooleanFieldOptions = <
	const TOptions extends BooleanFieldOptions,
>(
	options: TOptions,
): Readonly<TOptions> =>
	normalizeFieldOptions(options, normalizeFlatValidation, normalizeBooleanValue)

/** Creates immutable boolean metadata while preserving every option literal. */
export const booleanField: ScalarFieldFactory<
	'boolean',
	boolean,
	BooleanFieldOptions
> = createScalarFieldFactory(
	'boolean',
	normalizeBooleanFieldOptions,
	normalizeBooleanValue,
)
