// The values access rules see (D-44, D-77, D-86): a row's stored keys as
// `{ id }`, a relation write's ids, a `oneOf` as its kind and row (D-247).
import type { OneOfInfo } from './one-of-schema.ts'
import type { ModelInfo } from './schema.ts'
import { isObject } from './query-where.ts'
import { madeId } from './uuid.ts'

type Values = { readonly [field: string]: unknown }

/** A `oneOf`'s kind and row's id, or `null` when it names none. */
function oneOfRecord(info: OneOfInfo, row: Values): unknown {
	for (const [kind, { field }] of info.kinds) {
		const value = row[field]
		if (isObject(value)) return { kind, [kind]: { id: value['id'] } }
	}
	return null
}

/**
 * The record a rule sees: each stored `one` key as `{ id }` or `null`
 * (D-77), each `oneOf` as `{ kind, [kind]: { id } }` or `null` (D-247).
 */
export function recordOf(model: ModelInfo, row: Values): Values {
	const record: { [field: string]: unknown } = {
		id: row['id'],
		createdAt: row['createdAt'],
		updatedAt: row['updatedAt'],
	}
	for (const field of model.fields.values()) {
		const value = row[field.name]
		if (field.kind === 'scalar') record[field.name] = value ?? null
		else if (field.kind === 'one' && field.stored && field.of === undefined) {
			record[field.name] = isObject(value) ? { id: value['id'] } : null
		}
	}
	for (const info of model.oneOfs.values()) {
		record[info.name] = oneOfRecord(info, row)
	}
	return record
}

export function ids(value: unknown, key: string): { readonly id: unknown }[] {
	const list = isObject(value) ? value[key] : undefined
	return Array.isArray(list)
		? list.map((item: unknown) => ({ id: isObject(item) ? item['id'] : null }))
		: []
}

/** A `oneOf` write as its field rule sees it: the kind and the row's id. */
function oneOfValue(given: unknown): unknown {
	for (const operation of ['connect', 'create']) {
		const named = isObject(given) ? given[operation] : undefined
		const [entry] = isObject(named) ? Object.entries(named) : []
		if (entry === undefined) continue
		const [kind, operand] = entry
		if (!isObject(operand)) return null
		const id = operation === 'create' ? madeId(operand) : operand['id']
		return { kind, [kind]: { id } }
	}
	return null
}

/** The value a field rule sees (D-44, D-86): a relation's ids, not its data. */
export function fieldValue(
	model: ModelInfo,
	name: string,
	given: unknown,
): unknown {
	if (model.oneOfs.has(name)) return oneOfValue(given)
	const kind = model.fields.get(name)?.kind
	const create = isObject(given) ? given['create'] : undefined
	if (kind === 'many') {
		return {
			connect: ids(given, 'connect'),
			disconnect: ids(given, 'disconnect'),
			delete: ids(given, 'delete'),
			// The rows it creates, by the ids the kernel gives them (D-128).
			create: Array.isArray(create)
				? create.filter(isObject).map((item) => ({ id: madeId(item) }))
				: [],
		}
	}
	if (kind !== 'one') return given
	if (isObject(create)) return { id: madeId(create) }
	const connect = isObject(given) ? given['connect'] : undefined
	return isObject(connect) ? { id: connect['id'] } : null
}

/**
 * Whether a relation value only updates linked rows: it changes no link, so
 * the field rule does not judge it (D-138).
 */
export function updatesOnly(
	model: ModelInfo,
	name: string,
	given: unknown,
): boolean {
	const kind = model.fields.get(name)?.kind
	if (!isObject(given) || given['update'] === undefined) return false
	if (kind === 'one') return true
	if (kind !== 'many') return false
	const links = ['connect', 'disconnect', 'create', 'delete']
	return links.every((key) => ids(given, key).length === 0)
}
