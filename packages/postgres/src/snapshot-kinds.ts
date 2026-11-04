// A `oneOf`'s check on its kinds' keys (D-247): one of them set, at most
// one when the field is optional.
import type { Catalog, Table } from './names.ts'
import { constraint, snake } from './names.ts'
import type { Check } from './snapshot.ts'

/** Each `oneOf` of the table's model: its check's name, words and columns. */
export function kindChecks(
	catalog: Catalog,
	table: Table,
): { readonly name: string; readonly what: string; readonly check: Check }[] {
	const kinds = new Map<string, { columns: string[]; optional: boolean }>()
	for (const given of table.model.fields) {
		if (given.kind !== 'one' || given.of === undefined) continue
		const { field, optional } = given.of
		const found = kinds.get(field) ?? { columns: [], optional }
		found.columns.push(catalog.column(table, given.name))
		kinds.set(field, found)
	}
	return [...kinds].map(([field, { columns, optional }]) => ({
		name: constraint(`${table.name}_${snake(field)}_check`),
		what: `the check on ${table.model.name}.${field}`,
		check: {
			field,
			kinds: columns,
			...(optional ? { optional: true as const } : {}),
		},
	}))
}
