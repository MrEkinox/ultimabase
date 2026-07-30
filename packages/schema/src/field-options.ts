import { immutableRecord } from '@ultimabase/shared'

import { defineExtensions } from './extension.js'
import type { FieldOptions, FieldValidationOptions } from './field.js'

/**
 * Copies common field metadata while delegating primitive-specific validation.
 */
export const normalizeFieldOptions = <
	TValue,
	TValidation extends FieldValidationOptions,
	const TOptions extends FieldOptions<TValue, TValidation>,
>(
	options: TOptions,
	normalizeValidation: (validation: TValidation) => Readonly<TValidation>,
): Readonly<TOptions> => {
	const validation =
		options.validation === undefined
			? undefined
			: normalizeValidation(options.validation)
	const extensions =
		options.extensions === undefined
			? undefined
			: defineExtensions(options.extensions)

	// Conditional spreads preserve absent options and replace nested values with frozen copies.
	return immutableRecord({
		...options,
		...(validation === undefined ? {} : { validation }),
		...(extensions === undefined ? {} : { extensions }),
	})
}
