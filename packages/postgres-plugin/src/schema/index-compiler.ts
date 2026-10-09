import type { SchemaIndexCondition } from '@ultimabase/core'
import { immutableArray } from '@ultimabase/shared'
import { sql } from 'drizzle-orm'
import {
	index,
	uniqueIndex,
	type ExtraConfigColumn,
	type Index,
	type PgTableExtraConfigValue,
} from 'drizzle-orm/pg-core'

import { createPostgresIndexName } from '../naming.js'
import { required } from '../required.js'
import type { PostgresIndexMethod, PostgresStorageKind } from './contracts.js'
import { renderPostgresIndexPredicate } from './index-predicate.js'

/** Accepts public schema indexes and owner-private unique indexes alike. */
interface PostgresIndexDefinition {
	readonly fields: readonly string[]
	readonly unique: boolean
	readonly where?: readonly SchemaIndexCondition[]
}

// Index names embed a hash of their predicate, so one name has one predicate.
const partialIndexPredicates = new Map<string, string>()

/** Reads the rendered `WHERE` predicate of one generated partial index name. */
export const readPostgresIndexPredicate = (name: string): string | undefined =>
	partialIndexPredicates.get(name)

/** Compiles normalized logical indexes in their declaration order. */
export const compilePostgresIndexBuilders = (
	tableName: string,
	definitions: readonly PostgresIndexDefinition[],
	columns: Readonly<Record<string, ExtraConfigColumn>>,
	storageByField: ReadonlyMap<string, PostgresStorageKind>,
): PgTableExtraConfigValue[] => {
	const names = new Set<string>()

	return definitions.map((definition) => {
		const predicate =
			definition.where === undefined
				? undefined
				: renderPostgresIndexPredicate(definition.where, storageByField)
		const name = createPostgresIndexName(
			tableName,
			definition.fields,
			definition.unique,
			predicate,
		)
		if (predicate !== undefined) partialIndexPredicates.set(name, predicate)

		if (names.has(name)) {
			throw new TypeError(`Duplicate PostgreSQL index definition: ${name}`)
		}

		names.add(name)
		const [first, ...rest] = definition.fields.map((fieldName) =>
			required(
				columns[fieldName],
				`PostgreSQL index references missing field: ${fieldName}`,
			),
		)

		if (first === undefined) {
			throw new TypeError(`PostgreSQL index has no fields: ${name}`)
		}

		const builder = definition.unique ? uniqueIndex(name) : index(name)

		// GIN is used only for one non-unique JSONB containment index.
		const built =
			!definition.unique &&
			rest.length === 0 &&
			definition.fields.every((field) => storageByField.get(field) === 'jsonb')
				? builder.using('gin', first)
				: builder.on(first, ...rest)
		return predicate === undefined ? built : built.where(sql.raw(predicate))
	})
}

/** Reads the explicit name required by UltimaBase-generated Drizzle indexes. */
export const readDrizzleIndexName = (index: Index): string =>
	required(index.config.name, 'Drizzle omitted PostgreSQL index name')

/** Narrows Drizzle's extensible index methods to direct-sync capabilities. */
export const readDrizzleIndexMethod = (index: Index): PostgresIndexMethod => {
	const method = index.config.method ?? 'btree'

	if (method !== 'btree' && method !== 'gin') {
		throw new TypeError(`Unsupported PostgreSQL index method: ${method}`)
	}

	return method
}

/** Extracts the simple physical column tuple retained by a Drizzle index. */
export const readDrizzleIndexColumns = (
	index: Index,
): readonly [string, ...string[]] => {
	const name = readDrizzleIndexName(index)
	const [first, ...rest] = index.config.columns.map((column: unknown) => {
		if (
			typeof column !== 'object' ||
			column === null ||
			!('name' in column) ||
			typeof column.name !== 'string'
		) {
			throw new TypeError(
				`PostgreSQL synchronization cannot compile expression index: ${name}`,
			)
		}

		return column.name
	})

	if (first === undefined) {
		throw new TypeError(`Drizzle PostgreSQL index has no columns: ${name}`)
	}

	return immutableArray([first, ...rest])
}
