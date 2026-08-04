import {
	defineFieldExtension,
	type FieldExtension,
	type GenericField,
} from '@ultimabase/core'
import {
	assertNonEmptyString,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import {
	postgresColumnExtensionName,
	postgresPluginName,
} from '../constants.js'

/** Declares the previous physical identifier used for a data-preserving rename. */
export interface PostgresColumnOptions<TRenamedFrom extends string = string> {
	readonly renamedFrom: TRenamedFrom
}

/** Carries PostgreSQL rename metadata without coupling Schema to storage policy. */
export type PostgresColumnExtension<TRenamedFrom extends string = string> =
	FieldExtension<
		typeof postgresColumnExtensionName,
		PostgresColumnOptions<TRenamedFrom>,
		typeof postgresPluginName
	>

const postgresColumnOptionKeys = new Set(['renamedFrom'])

const assertPostgresColumnOptions: (
	options: unknown,
) => asserts options is PostgresColumnOptions = (options) => {
	if (!isPlainRecord(options)) {
		throw new TypeError('postgres column options must be a plain object')
	}

	for (const key of Object.keys(options)) {
		if (!postgresColumnOptionKeys.has(key)) {
			throw new TypeError(`postgres column contains unknown key: ${key}`)
		}
	}

	assertNonEmptyString(options.renamedFrom, 'postgres column renamedFrom')
}

/** Creates immutable PostgreSQL metadata for one field declaration. */
export const postgresColumn = <const TRenamedFrom extends string>(
	options: PostgresColumnOptions<TRenamedFrom>,
): PostgresColumnExtension<TRenamedFrom> => {
	const untrustedOptions: unknown = options

	assertPostgresColumnOptions(untrustedOptions)

	return defineFieldExtension(
		postgresColumnExtensionName,
		{ renamedFrom: options.renamedFrom },
		postgresPluginName,
	)
}

/** Reads the optional previous name after Schema has normalized the extension list. */
export const resolvePostgresRenamedFrom = (
	field: GenericField,
): string | undefined => {
	const options: object = field.options

	if (!('extensions' in options) || !isUnknownArray(options.extensions)) {
		return undefined
	}

	const extension: unknown = options.extensions.find(
		(candidate: unknown) =>
			isPlainRecord(candidate) &&
			candidate.name === postgresColumnExtensionName,
	)

	if (!isPlainRecord(extension)) {
		return undefined
	}

	assertPostgresColumnOptions(extension.config)

	return extension.config.renamedFrom
}
