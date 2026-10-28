// What a read's jsonb holds, back as the rows the kernel expects (D-73): a
// date arrives as text in UTC without its zone, everything else as written.
import type { Nested, Row } from 'ultimabase'
import { isRow } from 'ultimabase/internal'
import type { Catalog } from './names.ts'

const dates = new Set(['createdAt', 'updatedAt'])

function decodeRow(
	catalog: Catalog,
	model: string,
	value: unknown,
	nested: Nested,
): Row {
	if (!isRow(value)) throw new Error(`A ${model} row has no id.`)
	const table = catalog.table(model)
	const row: { id: string; [field: string]: unknown } = { ...value }
	for (const [name, item] of Object.entries(value)) {
		const field = table.fields.get(name)
		const inner = nested.include?.[name]
		if (
			typeof item === 'string' &&
			(dates.has(name) ||
				(field?.kind === 'scalar' && field.type === 'dateTime'))
		) {
			row[name] = new Date(`${item}Z`)
		} else if (inner !== undefined && field?.kind === 'many') {
			row[name] = decodeRows(catalog, field.target, item, inner)
		} else if (inner !== undefined && field?.kind === 'one' && item !== null) {
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
