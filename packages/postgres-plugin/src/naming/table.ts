import {
	defineSchemaExtension,
	type SchemaMetadata,
	type SchemaExtension,
} from '@ultimabase/core'
import { assertNonEmptyString, isPlainRecord } from '@ultimabase/shared'
import { tableize } from 'inflection'

import { postgresPluginName, postgresTableExtensionName } from '../constants.js'

/** Carries an exact developer-selected PostgreSQL identifier. */
export interface PostgresTableOptions<TName extends string = string> {
	readonly name: TName
}

/** Attaches PostgreSQL-owned naming metadata without changing Schema. */
export type PostgresTableExtension<TName extends string = string> =
	SchemaExtension<
		typeof postgresTableExtensionName,
		PostgresTableOptions<TName>,
		typeof postgresPluginName
	>

const postgresTableOptionKeys = new Set(['name'])

const assertPostgresTableOptions: (
	options: unknown,
) => asserts options is PostgresTableOptions = (options) => {
	if (!isPlainRecord(options)) {
		throw new TypeError('postgres table options must be a plain object')
	}

	for (const key of Object.keys(options)) {
		if (!postgresTableOptionKeys.has(key)) {
			throw new TypeError(`postgres table contains unknown key: ${key}`)
		}
	}

	assertNonEmptyString(options.name, 'postgres table name')
}

/** Creates a typed schema extension while preserving the identifier verbatim. */
export const postgresTable = <const TName extends string>(
	options: PostgresTableOptions<TName>,
): PostgresTableExtension<TName> => {
	const untrustedOptions: unknown = options

	assertPostgresTableOptions(untrustedOptions)

	return defineSchemaExtension(
		postgresTableExtensionName,
		{ name: options.name },
		postgresPluginName,
	)
}

/** Finds and validates the optional PostgreSQL-owned override on one schema. */
const getExplicitTableName = (schema: SchemaMetadata): string | undefined => {
	const extension = schema.extensions.find(
		(candidate) => candidate.name === postgresTableExtensionName,
	)

	if (extension === undefined) {
		return undefined
	}

	assertPostgresTableOptions(extension.config)

	return extension.config.name
}

/** Resolves one safely escapable physical identifier from static schema metadata. */
export const resolvePostgresTableName = (schema: SchemaMetadata): string =>
	getExplicitTableName(schema) ?? tableize(schema.className)
