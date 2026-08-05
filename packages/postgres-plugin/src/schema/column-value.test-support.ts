import type { PgColumn } from 'drizzle-orm/pg-core'

/** Contains Drizzle's generic mapper result at the test's unknown boundary. */
export const mapPostgresColumnFromDriver = (
	column: PgColumn,
	value: unknown,
): unknown => {
	const mapped: unknown = column.mapFromDriverValue(value)

	return mapped
}

/** Contains Drizzle's generic mapper result at the test's unknown boundary. */
export const mapPostgresColumnToDriver = (
	column: PgColumn,
	value: unknown,
): unknown => {
	const mapped: unknown = column.mapToDriverValue(value)

	return mapped
}
