// The fixed defaults a column added to a table with rows fills them with
// (D-105); a list's is `[]` when it has none (D-120, D-127).
import type { Catalog, Kind } from './names.ts'
import { id } from './plan-parts.ts'

export const literal = (value: string): string =>
	`'${value.replaceAll("'", "''")}'`

/**
 * A fixed default as SQL, and as the log shows it: `'draft'`; or, `rows`,
 * the update filling each row from another table (D-236).
 */
export type Fill = {
	readonly sql: string
	readonly shown: string
	readonly rows?: true
	/** A list's `[]`, which no default of the model asked for (D-280). */
	readonly implicit?: true
}

/** Each table's columns with a fixed default (D-105). */
export type Fills = {
	readonly [table: string]: { readonly [column: string]: Fill }
}

function fillOf(kind: Kind, value: unknown): Fill {
	if (kind.endsWith('[]') && Array.isArray(value)) {
		const items = value.map(
			(item) => `"${String(item).replaceAll(/[\\"]/g, '\\$&')}"`,
		)
		const text = literal(`{${items.join(',')}}`)
		return { sql: `${text}::${kind}`, shown: text }
	}
	if (kind === 'json') {
		const text = literal(JSON.stringify(value))
		return { sql: `${text}::jsonb`, shown: text }
	}
	if (value instanceof Date) {
		const text = literal(value.toISOString())
		return { sql: `${text}::timestamptz`, shown: text }
	}
	const text = typeof value === 'string' ? literal(value) : String(value)
	return { sql: text, shown: text }
}

/** The columns whose field has a fixed default, which rows take when added. */
export function fillsOf(catalog: Catalog): Fills {
	const fills: Record<string, Record<string, Fill>> = {}
	for (const table of catalog.tables.values()) {
		const columns: Record<string, Fill> = {}
		for (const field of table.model.fields) {
			if (field.kind !== 'scalar') continue
			// A list's rows hold `[]` when nothing else is given (D-120).
			const given = field.list ? (field.default ?? []) : field.default
			if (given === undefined) continue
			const kind = catalog.kind(table, field.name)
			const fill = fillOf(kind, given)
			columns[catalog.column(table, field.name)] =
				field.default === undefined ? { ...fill, implicit: true } : fill
		}
		fills[table.name] = columns
	}
	// A link kept within a parent takes its row's (D-236).
	for (const [side, join] of catalog.joins) {
		if (side !== join.relation || join.within === undefined) continue
		const { field, column, owner } = join.within
		const [table, self] = [id(join.table), id(join.self)]
		const value = `(select ${id(owner)} from ${id(join.owner)} where "id" = ${table}.${self})`
		fills[join.table] = {
			[column]: {
				sql: `update ${table} set ${id(column)} = ${value}`,
				shown: `the ${field} of each link's ${side.split('.')[0]}`,
				rows: true,
			},
		}
	}
	return fills
}
