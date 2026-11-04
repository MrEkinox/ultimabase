// A `one` view (D-240): the one row of a one-to-many `many` that its filter
// keeps, which a unique index of the target holds single. The filter runs
// once, at startup, where the index check reads it; one that pins fields to
// the viewer runs again for each caller (D-245).
import type { Condition, Filter, SchemaModel } from './adapter.ts'
import type { IndexValue, IndexWhere } from './adapter-indexes.ts'
import type { FieldOptions } from './definition.ts'
import { InvalidQuery, Refused } from './errors.ts'
import type { Models, Scope } from './query-where.ts'
import { isObject, modelOf, normalizeWhere } from './query-where.ts'
import {
	isFiltered,
	relationsOf,
	viewerViews,
	viewField,
	viewFilters,
} from './relations.ts'
import { filterOf, isReadFilter, readFilter } from './rules.ts'
import type { FieldInfo, ModelInfo } from './schema.ts'

export type OneView = Extract<
	FieldInfo,
	{ readonly kind: 'one'; readonly stored: false }
> & { readonly from: string }

/** The options a view takes besides `from` (D-150, D-216). */
const described = new Set(['from', 'description', 'deprecated'])

export const isOneView = (field: FieldInfo | undefined): field is OneView =>
	field?.kind === 'one' && !field.stored && field.from !== undefined

/**
 * A `one` view: the target's rows on the link of `source`, the one-to-many
 * `many` its `from` names. Stops startup on any option but `from`.
 */
export function oneViewField(
	view: {
		readonly model: string
		readonly name: string
		readonly target: string
		readonly options: FieldOptions
	},
	from: string,
	source: FieldInfo | 'view' | undefined,
): FieldInfo {
	const { model, name, target, options } = view
	const at = `${model}.${name}`
	for (const key of Object.keys(options)) {
		if (described.has(key) || options[key] === undefined) continue
		throw new Refused(`${at} is a view and takes no ${key}.`)
	}
	const many = viewField(view, from, source)
	if (many.kind !== 'many') throw new Error('A view reads a many.')
	if (many.join) {
		throw new Refused(
			`${at}: from '${from}' is a many-to-many; a one view reads a one-to-many.`,
		)
	}
	return {
		kind: 'one',
		name,
		target,
		stored: false,
		inverse: many.inverse,
		unique: false,
		optional: true,
		onDelete: 'setNull',
		from,
		options,
	}
}

/** Runs each view's filter and checks a unique index holds its row single. */
export function checkOneViews(
	models: Models,
	schema: readonly SchemaModel[],
): void {
	for (const model of models.values()) {
		for (const field of model.fields.values()) {
			if (!isOneView(field)) continue
			const at = `${model.name}.${field.name} reads one ${field.target}`
			const filter = run(models, model, field)
			const pinned = pinnedOf(filter, at)
			const fields = new Set([field.inverse, ...pinned])
			const target = schema.find((each) => each.name === field.target)
			const held = target?.indexes.some(
				(index) =>
					index.unique &&
					index.fields.every((name) => fields.has(name)) &&
					(index.where === undefined || keeps(filter, index.where)),
			)
			if (held !== true) {
				const named = [...fields]
				const where = shownWhere(modelOf(models, field.target), filter, pinned)
				const list = named.map((name) => `'${name}'`).join(', ')
				const index = `{ fields: [${list}], unique: true`
				// An index on the pinned fields holds one row without a where.
				const how =
					where !== undefined
						? ` whose where the filter keeps, as ${index}, where: ${where} }`
						: pinned.length > 0
							? `, as ${index} }`
							: ' whose where the filter keeps'
				throw new Refused(
					`${at}: give ${field.target} a unique index on ${named.join(' and ')}${how}.`,
				)
			}
			viewFilters.set(field, filter)
			if (pinned.length > 0) viewerViews.add(field)
		}
	}
}

function run(models: Models, model: ModelInfo, field: OneView): Filter {
	const path = `${model.name}.with.relations.${field.name}.where`
	const rule = relationsOf(model)[field.name]
	const where = isObject(rule) ? rule['where'] : undefined
	if (typeof where !== 'function') throw new Error(`${path} is a function.`)
	const result: unknown = Reflect.apply(where, undefined, [
		{ where: readFilter },
	])
	if (!isReadFilter(result)) {
		throw new Refused(`${path} returns where({ ... }).`)
	}
	try {
		return normalizeWhere(
			models,
			modelOf(models, field.target),
			filterOf(result),
			path,
			startup(path),
		)
	} catch (error) {
		if (error instanceof InvalidQuery) throw new Refused(error.message)
		throw error
	}
}

/** The user id the startup run reads as the viewer's, to find what it pins. */
const someViewer = 'ultimabase:startup-viewer'
/** `viewer: true` and `viewer: false` on a relation, once normalized. */
const [pin, unpin] = ['is', 'isNot'].map((key) =>
	JSON.stringify({ [key]: { id: { equals: someViewer } } }),
)

/**
 * The fields `filter` pins to the viewer, each row's own: `viewer: true` on a
 * relation of the filter's top level. Stops startup on any other `viewer`.
 */
function pinnedOf(filter: Filter, at: string): readonly string[] {
	const values = [filter, ...(filter.AND ?? [])].flatMap((part) =>
		Object.entries(part).map(
			([key, value]) => [key, JSON.stringify(value)] as const,
		),
	)
	const pinned = values.flatMap(([key, value]) => (value === pin ? [key] : []))
	const uses = JSON.stringify(filter).split(JSON.stringify(someViewer)).length
	if (uses - 1 === pinned.length) return pinned
	throw new Refused(
		values.some(([, value]) => value === unpin)
			? `${at}: viewer: false keeps several rows; a one view takes viewer: true.`
			: `${at}: viewer pins a field of the filter's top level, outside OR, NOT and nested relations.`,
	)
}

/**
 * The scope of a filter run at startup: no caller, no other filter, and a
 * viewer only to find the fields it pins.
 */
function startup(path: string): Scope {
	return {
		check: () => undefined,
		ruled: () => false,
		readable: () => undefined,
		related: (model, field) => {
			if (!isFiltered(model, field.name)) return undefined
			throw new Refused(
				`${path}: ${model.name}.${field.name} is filtered, which a one view's filter does not read.`,
			)
		},
		viewer: someViewer,
	}
}

/** The conditions `filter` holds on every row it keeps, by field. */
function conjuncts(filter: Filter, into = new Map<string, Condition[]>()) {
	for (const part of filter.AND ?? []) conjuncts(part, into)
	for (const [key, value] of Object.entries(filter)) {
		if (key === 'AND' || key === 'OR' || key === 'NOT') continue
		if (isCondition(value)) into.set(key, [...(into.get(key) ?? []), value])
	}
	return into
}

const isCondition = (value: unknown): value is Condition =>
	isObject(value) && !Array.isArray(value)

const same = (a: unknown, b: IndexValue): boolean =>
	a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b

/** Whether each condition of an index's `where` is one of `filter`'s. */
function keeps(filter: Filter, where: IndexWhere): boolean {
	const held = conjuncts(filter)
	return Object.entries(where).every(([name, condition]) =>
		(held.get(name) ?? []).some((each) =>
			'equals' in condition
				? 'equals' in each && same(each.equals, condition.equals)
				: 'not' in each && same(each.not, condition.not),
		),
	)
}

function shown(value: unknown): string | undefined {
	if (value === null) return 'null'
	if (value instanceof Date) return `new Date('${value.toISOString()}')`
	if (typeof value === 'string') return `'${value}'`
	if (typeof value === 'number' || typeof value === 'boolean') {
		return String(value)
	}
	return undefined
}

/** `filter` written as an index's `where` of `target`, when it can be. */
function shownWhere(
	target: ModelInfo,
	filter: Filter,
	pinned: readonly string[],
): string | undefined {
	const parts: string[] = []
	for (const [key, condition] of Object.entries(filter)) {
		if (pinned.includes(key)) continue
		const field = target.fields.get(key)
		if (field?.kind !== 'scalar' || field.list || !isCondition(condition)) {
			return undefined
		}
		const [first, ...others] = Object.entries(condition)
		const value = shown(first?.[1])
		if (first === undefined || others.length > 0 || value === undefined) {
			return undefined
		}
		if (first[0] === 'equals') parts.push(`${key}: ${value}`)
		else if (first[0] === 'not') parts.push(`${key}: { not: ${value} }`)
		else return undefined
	}
	return parts.length === 0 ? undefined : `{ ${parts.join(', ')} }`
}
