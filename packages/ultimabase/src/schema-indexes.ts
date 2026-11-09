// The indexes of a model, checked against its fields (D-52, D-120, D-141,
// D-170, D-174, D-215), and its searched fields (D-148).
import type { IndexValue, IndexWhere } from './adapter-indexes.ts'
import type { SchemaModel } from './adapter.ts'
import type { IndexDefinition } from './definition.ts'
import type { FieldInfo, ModelInfo } from './schema.ts'
import { readRules } from './access.ts'
import { Refused } from './errors.ts'
import { isObject, misfit } from './query-values.ts'

type Fields = ReadonlyMap<string, FieldInfo>

const isIndexValue = (value: unknown): value is IndexValue =>
	value === null ||
	value instanceof Date ||
	['string', 'number', 'boolean'].includes(typeof value)

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
	fields: Fields,
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

/**
 * A case-insensitive index is unique, over one string field at least; a
 * unique index has no contains already (D-170).
 */
function insensitiveIndex(
	model: string,
	fields: Fields,
	index: IndexDefinition,
): void {
	const text = index.fields.some((name) => {
		const field = fields.get(name)
		return field?.kind === 'scalar' && field.type === 'string'
	})
	if (index.mode !== 'insensitive' || index.unique !== true || !text) {
		throw new Refused(
			`${model}: a case-insensitive index is unique, without contains, over a string field at least.`,
		)
	}
}

// The kernel's fields: in a non-unique index only, in no where (D-22, D-174,
// D-215).
const implicit = new Set(['id', 'createdAt', 'updatedAt'])

/**
 * A partial unique index's filter: scalar fields that are no list, no json
 * and no plugin's field type, each equal to a value or `null`, or not
 * (D-215).
 */
function whereOf(
	model: string,
	fields: Fields,
	index: IndexDefinition,
): IndexWhere {
	const { where } = index
	if (index.unique !== true || index.contains === true) {
		throw new Refused(
			`${model}: an index with a where is unique, without contains.`,
		)
	}
	if (!isObject(where) || Object.keys(where).length === 0) {
		throw new Refused(`${model}: an index's where names a field at least.`)
	}
	const normal: { [field: string]: IndexWhere[string] } = {}
	for (const [name, given] of Object.entries(where)) {
		const field = implicit.has(name) ? undefined : fields.get(name)
		if (
			field?.kind !== 'scalar' ||
			field.list ||
			field.type === 'json' ||
			field.codec !== undefined
		) {
			throw new Refused(
				`${model}: index where '${name}' is not a scalar field that is no list, json or plugin's field type.`,
			)
		}
		const condition = isObject(given) ? given : { equals: given }
		const [operator, ...others] = Object.keys(condition)
		if ((operator !== 'equals' && operator !== 'not') || others.length > 0) {
			throw new Refused(
				`${model}: index where '${name}' takes a value, null, { equals } or { not }.`,
			)
		}
		const value = condition[operator]
		const issue = value === null ? undefined : misfit(value, field)
		if (issue !== undefined || !isIndexValue(value)) {
			throw new Refused(`${model}: index where '${name}': ${issue}`)
		}
		normal[name] = operator === 'equals' ? { equals: value } : { not: value }
	}
	return normal
}

/**
 * Refuses an index over no field, or over one that is not a column;
 * returns the indexes as the adapter reads them.
 */
export function checkIndexes(
	model: string,
	fields: Fields,
	indexes: readonly IndexDefinition[],
): SchemaModel['indexes'] {
	return indexes.map((index) => {
		if (index.fields.length === 0) {
			throw new Refused(`${model}: an index names at least one field.`)
		}
		for (const name of index.fields) {
			if (implicit.has(name)) {
				if (index.unique !== true) continue
				throw new Refused(
					`${model}: a unique index cannot name '${name}', which the kernel sets.`,
				)
			}
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
		if (index.mode !== undefined) insensitiveIndex(model, fields, index)
		return {
			fields: index.fields,
			unique: index.unique === true,
			contains: index.contains === true,
			...(index.mode === undefined ? {} : { mode: index.mode }),
			...(index.where === undefined
				? {}
				: { where: whereOf(model, fields, index) }),
		}
	})
}

/**
 * A searched field is the kernel's string, which every caller may read: a
 * match would reveal a value its read rule hides (D-148).
 */
export function checkSearch(model: ModelInfo): void {
	const rules = readRules(model)
	for (const field of model.fields.values()) {
		if (field.kind !== 'scalar' || field.search !== true) continue
		const name = `${model.name}.${field.name}`
		if (field.codec !== undefined) {
			throw new Refused(
				`${name}: a ${field.codec.plugin} field is not searched.`,
			)
		}
		if (rules[field.name] !== undefined) {
			throw new Refused(
				`${name} has a read rule, and a search would reveal its value: remove search or the rule.`,
			)
		}
	}
}
