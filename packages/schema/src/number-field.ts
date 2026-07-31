import { immutableRecord } from '@ultimabase/shared'

import { normalizeFieldOptions } from './field-options.js'
import type {
	FieldDefinition,
	FieldOptions,
	FieldValidationOptions,
	ValidatedFieldOptions,
} from './field.js'
import {
	normalizeNumericRange,
	type NumericRange,
	type NumericRangeBoundary,
} from './numeric-range.js'

/**
 * Separates JavaScript integer semantics from general floating-point numbers.
 */
export type NumberMode = 'integer' | 'float'

/**
 * Defines declarative boundaries for numeric field values.
 */
export type NumberRangeValidationOptions = NumericRange

/**
 * Groups presence and numeric constraints under one validation boundary.
 */
export type NumberValidationOptions = FieldValidationOptions & {
	readonly range?: NumberRangeValidationOptions
	readonly finite?: boolean
}

/**
 * Requires callers to choose the JavaScript number mode explicitly.
 */
export type NumberFieldOptions<TMode extends NumberMode = NumberMode> =
	TMode extends 'integer'
		? FieldOptions<number, NumberValidationOptions> & {
				readonly mode: TMode
				readonly autoIncrement?: boolean
			}
		: FieldOptions<number, NumberValidationOptions> & {
				readonly mode: TMode
				readonly autoIncrement?: never
			}

/**
 * Carries the number value type, mode, and exact options through schema inference.
 */
export type NumberField<
	TOptions extends NumberFieldOptions = NumberFieldOptions,
> = FieldDefinition<'number', number, TOptions>

const assertValidRangeBoundary = (
	mode: NumberMode,
	name: NumericRangeBoundary,
	value: number | undefined,
): void => {
	if (value === undefined) {
		return
	}

	const valid =
		mode === 'integer' ? Number.isSafeInteger(value) : Number.isFinite(value)

	if (!valid) {
		const expectation =
			mode === 'integer' ? 'a safe integer' : 'a finite number'

		throw new RangeError(
			`validation.range.${name} must be ${expectation} in ${mode} mode`,
		)
	}
}

const normalizeNumberValidation = (
	mode: NumberMode,
	validation: NumberValidationOptions,
): Readonly<NumberValidationOptions> => {
	const { range } = validation

	// The mode controls boundary precision while finite remains declarative value metadata.
	return range === undefined
		? immutableRecord(validation)
		: immutableRecord({
				...validation,
				range: normalizeNumericRange(
					range,
					'validation.range',
					(name, value) => {
						assertValidRangeBoundary(mode, name, value)
					},
				),
			})
}

/**
 * Creates immutable numeric metadata while preserving the explicit mode and literals.
 */
export function numberField<const TOptions extends NumberFieldOptions>(
	options: TOptions &
		(ValidatedFieldOptions<NoInfer<TOptions>, number> extends never
			? never
			: unknown),
): NumberField<TOptions>

export function numberField(options: NumberFieldOptions): NumberField {
	if (options.mode === 'float' && 'autoIncrement' in options) {
		throw new TypeError('autoIncrement is only available in integer mode')
	}

	return immutableRecord({
		kind: 'number',
		options: normalizeFieldOptions(options, (validation) =>
			normalizeNumberValidation(options.mode, validation),
		),
	})
}
