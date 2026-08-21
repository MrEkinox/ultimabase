import {
	defineSchemaOption,
	type GenericField,
	type SchemaDefinition,
	type SchemaOptionDefinition,
} from '@ultimabase/core'
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

/** Configures migration metadata owned by one persisted PostgreSQL field. */
export interface PostgresFieldOption {
	/** Names the previous physical column used by a data-preserving rename. */
	readonly renamedFrom: string
}

const postgresSchemaOptionKeys = new Set(['table'])
const postgresFieldOptionKeys = new Set(['renamedFrom'])

const assertKnownKeys = (
	value: Readonly<Record<string, unknown>>,
	keys: ReadonlySet<string>,
	path: string,
): void => {
	const unknownKey = Reflect.ownKeys(value).find(
		(key) => typeof key !== 'string' || !keys.has(key),
	)

	if (unknownKey !== undefined) {
		throw new TypeError(`Unknown ${path} key: ${String(unknownKey)}`)
	}
}

const normalizePostgresSchemaOption = (
	value: unknown,
	path: string,
): PostgresSchemaOption => {
	if (!isPlainRecord(value)) {
		throw new TypeError(`${path} must be a plain object`)
	}

	assertKnownKeys(value, postgresSchemaOptionKeys, path)
	assertNonEmptyString(value.table, `${path}.table`)

	return immutableRecord({ table: value.table })
}

const normalizePostgresFieldOption = (
	value: unknown,
	path: string,
): PostgresFieldOption => {
	if (!isPlainRecord(value)) {
		throw new TypeError(`${path} must be a plain object`)
	}

	assertKnownKeys(value, postgresFieldOptionKeys, path)
	assertNonEmptyString(value.renamedFrom, `${path}.renamedFrom`)

	return immutableRecord({ renamedFrom: value.renamedFrom })
}

/** Owns the direct schema `postgres` namespace as portable naming metadata. */
export const postgresSchemaOption: SchemaOptionDefinition<PostgresSchemaOption> =
	defineSchemaOption({
		normalize: normalizePostgresSchemaOption,
		protocolVersion: 1,
		typegen: {
			module: '@ultimabase/postgres-plugin',
			type: 'PostgresSchemaOption',
		},
	})

/** Owns the direct field `postgres` namespace as portable migration metadata. */
export const postgresFieldOption: SchemaOptionDefinition<PostgresFieldOption> =
	defineSchemaOption({
		normalize: normalizePostgresFieldOption,
		protocolVersion: 1,
		typegen: {
			module: '@ultimabase/postgres-plugin',
			type: 'PostgresFieldOption',
		},
	})

const readPostgresSchemaOption = (
	schema: SchemaDefinition,
): PostgresSchemaOption | undefined =>
	Object.hasOwn(schema.definition, 'postgres')
		? (Reflect.get(schema.definition, 'postgres') as
				PostgresSchemaOption | undefined)
		: undefined

const readPostgresFieldOption = (
	field: GenericField,
): PostgresFieldOption | undefined =>
	Object.hasOwn(field.options, 'postgres')
		? (Reflect.get(field.options, 'postgres') as
				PostgresFieldOption | undefined)
		: undefined

/** Resolves one safely escapable physical identifier from normalized metadata. */
export const resolvePostgresTableName = (schema: SchemaDefinition): string =>
	readPostgresSchemaOption(schema)?.table ?? tableize(schema.className)

/** Reads normalized explicit column-rename intent from one compiled field. */
export const resolvePostgresRenamedFrom = (
	field: GenericField,
): string | undefined => readPostgresFieldOption(field)?.renamedFrom
