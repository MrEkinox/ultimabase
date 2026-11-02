// What a read's jsonb holds, back as the rows the kernel expects (D-73): a
// date arrives as its milliseconds since the epoch, everything else as
// written.
import type { Nested, Row } from 'ultimabase'
import { isRow } from 'ultimabase/internal'
import type { Catalog, Table } from './names.ts'

/** Each table's date fields, listed once rather than on each row. */
const dated = new WeakMap<Table, readonly string[]>()

function datesOf(table: Table): readonly string[] {
	const known = dated.get(table)
	if (known !== undefined) return known
	const names = ['createdAt', 'updatedAt']
	for (const [name, field] of table.fields) {
		if (field.kind === 'scalar' && field.type === 'dateTime') names.push(name)
	}
	dated.set(table, names)
	return names
}

/** Decodes the parsed `value` in place: it is read once, and a copy costs. */
function decodeRow(
	catalog: Catalog,
	model: string,
	value: unknown,
	nested: Nested,
): Row {
	if (!isRow(value)) throw new Error(`A ${model} row has no id.`)
	const table = catalog.table(model)
	const row: { id: string; [field: string]: unknown } = value
	for (const name of datesOf(table)) {
		const item = row[name]
		if (typeof item === 'number') row[name] = new Date(item)
	}
	const { include } = nested
	if (include === undefined) return row
	for (const [name, inner] of Object.entries(include)) {
		const field = table.fields.get(name)
		const item = row[name]
		if (item === undefined) continue
		if (field?.kind === 'many') {
			row[name] = decodeRows(catalog, field.target, item, inner)
		} else if (field?.kind === 'one' && item !== null) {
			row[name] = decodeRow(catalog, field.target, item, inner)
		}
	}
	return row
}

/** The rows of a jsonb array of `model`, with the relations `nested` includes. */
export function decodeRows(
	catalog: Catalog,
	model: string,
	value: unknown,
	nested: Nested,
): Row[] {
	if (!Array.isArray(value))
		throw new Error(`The ${model} rows are not a list.`)
	return value.map((item: unknown) => decodeRow(catalog, model, item, nested))
}
