import type { SchemaIndexDefinition } from '@ultimabase/schema'
import {
	index,
	uniqueIndex,
	type ExtraConfigColumn,
	type PgTableExtraConfigValue,
} from 'drizzle-orm/pg-core'

import { createPostgresIndexName } from '../naming/index.js'

/** Compiles normalized logical indexes in their declaration order. */
export const compilePostgresIndexBuilders = (
	tableName: string,
	definitions: readonly SchemaIndexDefinition[],
	columns: Readonly<Record<string, ExtraConfigColumn>>,
): PgTableExtraConfigValue[] => {
	const names = new Set<string>()

	return definitions.map((definition) => {
		const name = createPostgresIndexName(
			tableName,
			definition.fields,
			definition.unique,
		)

		if (names.has(name)) {
			throw new TypeError(`Duplicate PostgreSQL index definition: ${name}`)
		}

		names.add(name)
		const indexedColumns = definition.fields.map((fieldName) => {
			const column = columns[fieldName]

			if (column === undefined) {
				throw new TypeError(
					`PostgreSQL index references missing field: ${fieldName}`,
				)
			}

			return column
		})
		const [first, ...rest] = indexedColumns

		if (first === undefined) {
			throw new TypeError(`PostgreSQL index has no fields: ${name}`)
		}

		const builder = definition.unique ? uniqueIndex(name) : index(name)

		return builder.on(first, ...rest)
	})
}
