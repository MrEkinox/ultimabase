import { immutableArray } from '@ultimabase/shared'
import type { Index } from 'drizzle-orm/pg-core'

import type { PostgresIndexMethod } from './contracts.js'

const readNamedIndexColumn = (value: unknown, indexName: string): string => {
	if (
		typeof value !== 'object' ||
		value === null ||
		!('name' in value) ||
		typeof value.name !== 'string'
	) {
		throw new TypeError(
			`PostgreSQL synchronization cannot compile expression index: ${indexName}`,
		)
	}

	return value.name
}

/** Reads the explicit name required by UltimaBase-generated Drizzle indexes. */
export const readDrizzleIndexName = (index: Index): string => {
	const name = index.config.name

	if (name === undefined) {
		throw new TypeError('Drizzle omitted PostgreSQL index name')
	}

	return name
}

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
	const columns = index.config.columns.map((column) =>
		readNamedIndexColumn(column, name),
	)
	const [first, ...rest] = columns

	if (first === undefined) {
		throw new TypeError(`Drizzle PostgreSQL index has no columns: ${name}`)
	}

	return immutableArray([first, ...rest])
}
