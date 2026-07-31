import { immutableRecord } from '@ultimabase/shared'

import { normalizeFieldOptions } from '../base/options.js'
import type {
	FieldDefinition,
	FieldOptions,
	FieldValidationOptions,
} from '../base/contract.js'
import {
	createScalarFieldFactory,
	type ScalarFieldFactory,
} from '../base/factory.js'
import { normalizeStringValue } from '../base/value.js'

/**
 * Lists the UUID versions identifiable through the standard version nibble.
 */
export type UuidVersion = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8

/**
 * Combines presence rules with an optional accepted UUID version.
 */
export type UuidValidationOptions = FieldValidationOptions & {
	readonly version?: UuidVersion
}

/**
 * Describes storage-neutral UUID metadata through its canonical string value.
 */
export type UuidFieldOptions = FieldOptions<string, UuidValidationOptions>

/**
 * Carries the UUID value and exact options through schema inference.
 */
export type UuidField<TOptions extends UuidFieldOptions = UuidFieldOptions> =
	FieldDefinition<'uuid', string, TOptions>

const normalizeUuidValidation = (
	validation: UuidValidationOptions,
): Readonly<UuidValidationOptions> => {
	const { version } = validation

	if (
		version !== undefined &&
		(!Number.isInteger(version) || version < 1 || version > 8)
	) {
		throw new RangeError('validation.version must be an integer from 1 to 8')
	}

	// The normalized version remains declarative for every runtime validator.
	return immutableRecord(validation)
}

const normalizeUuidFieldOptions = <const TOptions extends UuidFieldOptions>(
	options: TOptions,
): Readonly<TOptions> =>
	normalizeFieldOptions(options, normalizeUuidValidation, normalizeStringValue)

/** Creates immutable UUID metadata while preserving version constraints. */
export const uuidField: ScalarFieldFactory<'uuid', string, UuidFieldOptions> =
	createScalarFieldFactory(
		'uuid',
		normalizeUuidFieldOptions,
		normalizeStringValue,
	)
