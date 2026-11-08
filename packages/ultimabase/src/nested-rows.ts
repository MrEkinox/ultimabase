// The rows a nested write reaches. Those the items of a list name are read
// locked together (D-338): one read for up to `chunk` items, not one each.
import { and } from './access.ts'
import type { Filter, Lock, Row } from './adapter.ts'
import { normalized } from './decimal.ts'
import { PublicError } from './errors.ts'
import type { Resolving } from './nested-write.ts'
import { uniqueWhere } from './query-args.ts'
import type { Models } from './query-where.ts'
import { isObject, modelOf } from './query-where.ts'
import type { FieldInfo, ModelInfo } from './schema.ts'
import { planned } from './scope.ts'
import type { Reads } from './write-plan.ts'

/** An item's unique `where`, as given, and the filter its read takes. */
export type Named = { readonly where: unknown; readonly filter: Filter }

type Relation = Extract<FieldInfo, { readonly kind: 'one' | 'many' }>

/** Items read at once: their parameters stay far below PostgreSQL's 65535. */
export const chunk = 1000

/**
 * A unique field's value as text, the same given as stored. A row read holds
 * the values its item gave, none of them `null`.
 */
function text(model: ModelInfo, name: string, value: unknown): string {
	// A stored `one` key comes as `{ id }`, a given one as its id.
	const key = isObject(value) ? value['id'] : value
	if (key instanceof Date) return String(key.getTime())
	const field = model.fields.get(name)
	if (
		typeof key === 'string' &&
		field?.kind === 'scalar' &&
		field.type === 'decimal'
	) {
		return normalized(key, field.scale ?? 0)
	}
	return JSON.stringify(key)
}

/** The values of `names`, as one text: none of their texts holds a NUL. */
const keyOf = (
	model: ModelInfo,
	names: readonly string[],
	values: { readonly [name: string]: unknown },
): string => names.map((name) => text(model, name, values[name])).join('\0')

/** The fields `where` names, in one order. */
const namesOf = (where: unknown): string[] =>
	Object.keys(isObject(where) ? where : {}).toSorted()

/**
 * The row each of `items` names among those `base` selects, locked for
 * `lock`; `undefined` for one that names none.
 */
export async function namedRows(
	reads: Reads,
	model: ModelInfo,
	base: Filter | undefined,
	items: readonly Named[],
	lock: Lock,
): Promise<(Row | undefined)[]> {
	// Items naming the same fields are read together, and only their rows are
	// theirs: a row another unique found may fail the rules this one's apply.
	const groups = Map.groupBy(items, ({ where }) => namesOf(where).join(','))
	const indexes = new Map<string, Map<string, Row>>()
	for (const [names, group] of groups) {
		const fields = names.split(',')
		const index = new Map<string, Row>()
		for (let at = 0; at < group.length; at += chunk) {
			const filters = group.slice(at, at + chunk).map(({ filter }) => filter)
			const [only] = filters
			const where = filters.length === 1 && only ? only : { OR: filters }
			const read = { model: model.name, where: and(base, where), lock }
			for (const row of await reads.find(read)) {
				index.set(keyOf(model, fields, row), row)
			}
		}
		indexes.set(names, index)
	}
	return items.map(({ where }) => {
		const names = namesOf(where)
		const given = isObject(where) ? where : {}
		return indexes.get(names.join(','))?.get(keyOf(model, names, given))
	})
}

/**
 * The ids of the rows `connectOrCreate` items find as stored, without rules
 * (D-138), locked: `undefined` for one that finds none.
 */
export async function foundIds(
	models: Models,
	reads: Reads,
	target: ModelInfo,
	items: readonly { readonly where: unknown; readonly path: string }[],
): Promise<(string | undefined)[]> {
	const named = items.map(({ where, path }) => ({
		where,
		filter: uniqueWhere(models, target, where, path),
	}))
	const rows = await namedRows(reads, target, undefined, named, 'update')
	return rows.map((row) => row?.id)
}

/** The rows of the other side linked to the row written. */
export async function linked(
	r: Resolving,
	field: Relation,
	target: ModelInfo,
): Promise<Filter> {
	const parent = { id: { equals: r.id } }
	if (field.inverse === undefined) {
		// No other side (D-237): the key the row stores names the linked row.
		const read = { model: r.model.name, where: parent, fields: [field.name] }
		const key = (await r.reads.find({ ...read, take: 1 }))[0]?.[field.name]
		return { id: { in: isObject(key) ? [key['id']] : [] } }
	}
	const inverse = target.fields.get(field.inverse)
	return {
		[field.inverse]:
			inverse?.kind === 'many' ? { some: parent } : { is: parent },
	}
}

/** The linked row `where` names, as the caller may `operation` it. */
export async function reached(
	r: Resolving,
	field: Relation,
	where: Filter | undefined,
	path: string,
	operation: 'update' | 'delete',
): Promise<Row> {
	const target = modelOf(r.scope.models, field.target)
	const filter = await r.scope.filter(target.name, r.trusted, operation)
	const [row] = await r.reads.find({
		model: target.name,
		where: and(and(await linked(r, field, target), where), filter),
		take: 1,
		lock: operation,
	})
	if (row === undefined) throw missing(target, path)
	return row
}

export const missing = (target: ModelInfo, path: string): PublicError =>
	new PublicError('NOT_FOUND', `No ${target.name} matches ${path}.`)

/** A unique `where`, its fields' rules applied unless the value is trusted. */
async function unique(
	r: Resolving,
	target: ModelInfo,
	where: unknown,
	path: string,
): Promise<Filter> {
	const scope = r.trusted ? undefined : r.scope
	return planned(r.scope, () =>
		uniqueWhere(r.scope.models, target, where, path, scope),
	)
}

/** The row a `connectOrCreate` finds as stored, without rules (D-138). */
export const found = async (
	r: Resolving,
	target: ModelInfo,
	where: unknown,
	path: string,
): Promise<string | undefined> =>
	(await foundIds(r.scope.models, r.reads, target, [{ where, path }]))[0]

/**
 * The linked rows the `where` of `items` name, read at once (D-338), as the
 * caller may `operation` them; `undefined` for an item skipped or naming none.
 */
export async function reachedAll(
	r: Resolving,
	field: Relation,
	target: ModelInfo,
	items: readonly (
		{ readonly where: unknown; readonly path: string } | undefined
	)[],
	operation: Lock,
): Promise<(Row | undefined)[]> {
	const named: Named[] = []
	for (const item of items) {
		if (item === undefined) continue
		const filter = await unique(r, target, item.where, item.path)
		named.push({ where: item.where, filter })
	}
	if (named.length === 0) return []
	const rules = await r.scope.filter(target.name, r.trusted, operation)
	const base = and(await linked(r, field, target), rules)
	const rows = await namedRows(r.reads, target, base, named, operation)
	let next = 0
	return items.map((item) => (item === undefined ? undefined : rows[next++]))
}
