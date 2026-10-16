import type { GenericField, SchemaDefinition } from '@ultimabase/core'
import {
	defineSchemaOption,
	type FieldOptionDefinition,
	type SchemaOptionDefinition,
	type SchemaRulesHKT,
} from '@ultimabase/core/plugin'
import { definePluginFieldOption } from '@ultimabase/plugin-kit'
import {
	assertNonEmptyString,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'
import { tableize } from 'inflection'

/** Configures physical PostgreSQL metadata owned by one logical schema. */
export interface PostgresSchemaOption {
	/** Preserves the exact PostgreSQL table identifier, including case and punctuation. */
	readonly table: string
}

/** Entry of `.with((plugins) => …)` owned by PostgreSQL, for one schema (ADR-0320). */
export interface PostgresRules {
	/**
	 * Names the exact PostgreSQL table instead of the plural `snake_case`
	 * class name.
	 * @example `.with((plugins) => plugins.postgres({ table: 'content_items' }))`
	 */
	readonly postgres?: PostgresSchemaOption
}

/** Contributes `postgres` to `.with((plugins) => …)` through Core's rules slot (ADR-0320). */
export interface PostgresSchemaRules extends SchemaRulesHKT {
	readonly rules: PostgresRules
}

/** Configures direct synchronization metadata for one persisted PostgreSQL field. */
export interface PostgresFieldOption {
	/** Names the previous physical column used by a data-preserving rename. */
	readonly renamedFrom: string
}

/** Validates one closed single-key option namespace and returns its string value. */
const readSingleStringOption = (
	value: unknown,
	path: string,
	key: 'renamedFrom' | 'table',
): string => {
	if (!isPlainRecord(value)) {
		throw new TypeError(`${path} must be a plain object`)
	}

	const unknownKey = Reflect.ownKeys(value).find(
		(candidate) => candidate !== key,
	)

	if (unknownKey !== undefined) {
		throw new TypeError(`Unknown ${path} key: ${String(unknownKey)}`)
	}

	const option = value[key]

	assertNonEmptyString(option, `${path}.${key}`)
	return option
}

/**
 * Owns the `postgres` rule as portable naming metadata; its static type comes
 * from the `.with` rules slot (ADR-0320).
 */
export const postgresSchemaOption: SchemaOptionDefinition<PostgresSchemaOption> =
	defineSchemaOption({
		normalize: (value, path): PostgresSchemaOption =>
			immutableRecord({ table: readSingleStringOption(value, path, 'table') }),
		protocolVersion: 1,
	})

/** Owns the direct field `postgres` namespace as data-preserving rename metadata. */
export const postgresFieldOption: FieldOptionDefinition<PostgresFieldOption> =
	definePluginFieldOption({
		contexts: ['stored'],
		normalize: (value, path): PostgresFieldOption =>
			immutableRecord({
				renamedFrom: readSingleStringOption(value, path, 'renamedFrom'),
			}),
		protocolVersion: 1,
	})

/** Reads one normalized string option without trusting its static type. */
const readNormalizedOption = (
	options: object,
	key: 'renamedFrom' | 'table',
): string | undefined => {
	const option: unknown = Object.hasOwn(options, 'postgres')
		? Reflect.get(options, 'postgres')
		: undefined

	return isPlainRecord(option) && typeof option[key] === 'string'
		? option[key]
		: undefined
}

/** Resolves one safely escapable physical identifier from normalized metadata. */
export const resolvePostgresTableName = (schema: SchemaDefinition): string =>
	readNormalizedOption(schema.definition, 'table') ?? tableize(schema.className)

/** Reads normalized explicit column-rename intent from one compiled field. */
export const resolvePostgresRenamedFrom = (
	field: GenericField,
): string | undefined => readNormalizedOption(field.options, 'renamedFrom')
