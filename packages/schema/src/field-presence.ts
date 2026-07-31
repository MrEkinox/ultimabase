import type { GenericField } from './field.js'

/** Reads one boolean validation flag without trusting external metadata. */
export const hasValidationFlag = (
	options: object,
	flag: 'nullable' | 'required',
): boolean => {
	if (
		!('validation' in options) ||
		typeof options.validation !== 'object' ||
		options.validation === null
	) {
		return false
	}

	// Explicit branches preserve safe property narrowing at an unknown boundary.
	return flag === 'nullable'
		? 'nullable' in options.validation && options.validation.nullable === true
		: 'required' in options.validation && options.validation.required === true
}

/** Mirrors create-input omission rules at runtime snapshot boundaries. */
export const isRequiredOnCreate = (field: GenericField): boolean =>
	hasValidationFlag(field.options, 'required') &&
	!('default' in field.options) &&
	!('autoIncrement' in field.options && field.options.autoIncrement === true) &&
	!('generatedOn' in field.options)
