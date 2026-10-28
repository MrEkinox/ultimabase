// The indexes of a model, checked against its fields (D-52, D-120, D-141).
import type { SchemaField } from './adapter.ts'
import type { IndexDefinition } from './definition.ts'
import { Refused } from './errors.ts'

/** An index on a list is a GIN index of that list alone (D-120). */
function listIndex(model: string, name: string, index: IndexDefinition): void {
	if (index.fields.length > 1) {
		throw new Refused(
			`${model}: the list '${name}' is indexed alone, in an index of its own.`,
		)
	}
	if (index.unique === true) {
		throw new Refused(`${model}: the list '${name}' cannot be unique.`)
	}
}

/** A `contains` index covers one string field, not a list (D-141). */
function containsIndex(
	model: string,
	fields: ReadonlyMap<string, SchemaField>,
	index: IndexDefinition,
): void {
	const [name] = index.fields
	const field = name === undefined ? undefined : fields.get(name)
	if (
		index.fields.length !== 1 ||
		index.unique === true ||
		field?.kind !== 'scalar' ||
		field.type !== 'string' ||
		field.list
	) {
		throw new Refused(
			`${model}: a contains index covers one string field that is not a list, and is not unique.`,
		)
	}
}

/** Refuses an index over a field that is not one of the model's columns. */
export function checkIndexes(
	model: string,
	fields: ReadonlyMap<string, SchemaField>,
	indexes: readonly IndexDefinition[],
): void {
	for (const index of indexes) {
		for (const name of index.fields) {
			const field = fields.get(name)
			if (
				field === undefined ||
				field.kind === 'many' ||
				(field.kind === 'one' && !field.stored)
			) {
				throw new Refused(
					`${model}: index field '${name}' is not a scalar or a stored one relation.`,
				)
			}
			if (field.kind === 'scalar' && field.list) {
				listIndex(model, name, index)
			}
		}
		if (index.contains === true) containsIndex(model, fields, index)
	}
}
