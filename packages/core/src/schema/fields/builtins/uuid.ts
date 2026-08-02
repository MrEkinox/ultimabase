import { immutableRecord } from '@ultimabase/shared'

import { normalizeFieldOptions } from '../base/options.js'
import type {
	FieldDefinition,
	FieldInferenceState,
	FieldListOption,
	FieldOptions,
	FieldValidationOptions,
	InvalidOptionsArguments,
} from '../base/contract.js'
import {
	type CompatibleScalarPresence,
	type CompactScalarFieldDefinition,
	createCompactScalarFieldFactory,
	type DefaultedCompactScalarFieldOptions,
	type NonDefaultedCompactScalarFieldOptions,
} from '../base/factory.js'
import { normalizeStringValue } from '../base/value.js'

/**
 * Lists the UUID versions identifiable through the standard version nibble.
 */
export type UuidVersion = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8

/**
 * Combines presence rules with an optional accepted UUID version.
 */
export interface UuidValidationOptions extends FieldValidationOptions {
	/**
	 * Accepts only UUIDs carrying this standard version nibble.
	 *
	 * @example `version: 7`
	 */
	readonly version?: UuidVersion
}

/**
 * Describes storage-neutral UUID metadata through its canonical string value.
 */
export type UuidFieldOptions = FieldOptions<string, UuidValidationOptions>

/**
 * Carries the UUID value and exact options through schema inference.
 */
export type UuidField<
	TInference extends FieldInferenceState = FieldInferenceState,
> = FieldDefinition<'uuid', string, UuidFieldOptions, TInference>

/** Provides UUID-specific names for the shared compact scalar contract. */
type DefaultedUuidFieldOptions<
	TRequired extends boolean,
	TNullable extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = DefaultedCompactScalarFieldOptions<
	UuidFieldOptions,
	string,
	TRequired,
	TNullable,
	TList,
	TImmutable
>

type NonDefaultedUuidFieldOptions<
	TRequired extends boolean,
	TNullable extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = NonDefaultedCompactScalarFieldOptions<
	UuidFieldOptions,
	string,
	TRequired,
	TNullable,
	TList,
	TImmutable
>

type ResolvedUuidField<
	TRequired extends boolean,
	TNullable extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
	THasDefault extends boolean,
> = CompactScalarFieldDefinition<
	'uuid',
	string,
	UuidFieldOptions,
	TRequired,
	TNullable,
	TList,
	TImmutable,
	THasDefault
>

type DefaultedUuidField<
	TRequired extends boolean,
	TNullable extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = ResolvedUuidField<TRequired, TNullable, TList, TImmutable, true>

type NonDefaultedUuidField<
	TRequired extends boolean,
	TNullable extends boolean,
	TList extends FieldListOption,
	TImmutable extends boolean,
> = ResolvedUuidField<TRequired, TNullable, TList, TImmutable, false>

interface UuidFieldFactory {
	<
		const TRequired extends boolean = false,
		const TNullable extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
	>(
		options: DefaultedUuidFieldOptions<TRequired, TNullable, TList, TImmutable>,
		...invalidOptions: InvalidOptionsArguments<
			CompatibleScalarPresence<TRequired, TNullable>
		>
	): DefaultedUuidField<TRequired, TNullable, TList, TImmutable>
	<
		const TRequired extends boolean = false,
		const TNullable extends boolean = false,
		const TList extends FieldListOption = false,
		const TImmutable extends boolean = false,
	>(
		options?: NonDefaultedUuidFieldOptions<
			TRequired,
			TNullable,
			TList,
			TImmutable
		>,
		...invalidOptions: InvalidOptionsArguments<
			CompatibleScalarPresence<TRequired, TNullable>
		>
	): NonDefaultedUuidField<TRequired, TNullable, TList, TImmutable>
}

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

/**
 * Declares a canonical UUID string with optional version validation.
 *
 * @example
 * ```ts
 * uuidField({ indexed: "unique", validation: { required: true, version: 7 } })
 * ```
 */
export const uuidField: UuidFieldFactory = createCompactScalarFieldFactory<
	'uuid',
	string,
	UuidFieldOptions
>('uuid', normalizeUuidFieldOptions, normalizeStringValue)
