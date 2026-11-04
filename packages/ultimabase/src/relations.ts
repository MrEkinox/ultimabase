// The filter of a `many` relation or a `one` view, from its model's
// `.with({ relations })` (D-151, D-240): every read of the relation sees only
// the rows it keeps, Master's too, and a filtered relation takes no `set`.
import type { Filter } from './adapter.ts'
import type { FieldOptions } from './definition.ts'
import { InvalidQuery, Refused } from './errors.ts'
import type { Models, Scope } from './query-where.ts'
import { isObject, modelOf, normalizeWhere } from './query-where.ts'
import type { Caller } from './rules.ts'
import { filterOf, isReadFilter, readFilter } from './rules.ts'
import type { FieldInfo, ModelInfo } from './schema.ts'
import { sizeOf } from './sizes.ts'

type Many = Extract<FieldInfo, { readonly kind: 'many' }>
type One = Extract<FieldInfo, { readonly kind: 'one' }>

/** Each `one` view's filter, which runs once, at startup (D-240). */
export const viewFilters: WeakMap<FieldInfo, Filter> = new WeakMap()
/** The `one` views that pin a field to the viewer, run per caller (D-245). */
export const viewerViews: WeakSet<FieldInfo> = new WeakSet()

export function relationsOf(model: ModelInfo): {
	readonly [field: string]: unknown
} {
	const { rules } = model.definition
	const relations = isObject(rules) ? rules['relations'] : undefined
	return isObject(relations) ? relations : {}
}

const isView = (field: FieldInfo | undefined): boolean =>
	(field?.kind === 'many' || (field?.kind === 'one' && !field.stored)) &&
	field.from !== undefined

/**
 * Stops startup on a filter that names no `many` nor view of the model, or
 * on a view without one (D-151, D-240).
 */
export function checkRelations(model: ModelInfo): void {
	for (const [name, rule] of Object.entries(relationsOf(model))) {
		const where = `${model.name}.with.relations.${name}`
		const field = model.fields.get(name)
		if (field?.kind !== 'many' && !isView(field)) {
			throw new Refused(`${where}: ${name} is not a many relation.`)
		}
		if (!isObject(rule) || typeof rule['where'] !== 'function') {
			throw new Refused(`${where} takes a where function.`)
		}
	}
	for (const field of model.fields.values()) {
		if (isView(field) && !isFiltered(model, field.name)) {
			throw new Refused(
				`${model.name}.${field.name} is a view; filter it in .with({ relations }).`,
			)
		}
	}
}

/**
 * A view (D-151): `source`, the `many` its `from` names, under its own name
 * and options. Stops startup unless `from` names a `many` of the model to the
 * same target that is no view.
 */
export function viewField(
	view: {
		readonly model: string
		readonly name: string
		readonly target: string
		readonly options: FieldOptions
	},
	from: string,
	source: FieldInfo | 'view' | undefined,
	exists: boolean,
): FieldInfo {
	const { model, name, target, options } = view
	const at = `${model}.${name}`
	if (options['inverse'] !== undefined) {
		throw new Refused(`${at} is a view and takes no inverse.`)
	}
	sizeOf(at, options, false)
	if (source === 'view') {
		throw new Refused(`${at}: from '${from}' is a view; name its relation.`)
	}
	if (source?.kind !== 'many') {
		throw new Refused(`${at}: from '${from}' is not a many relation.`)
	}
	if (source.target !== target) {
		throw new Refused(
			`${at}: from '${from}' relates to ${source.target}, not ${target}.`,
		)
	}
	return { ...source, name, from, options, ...(exists && { exists }) }
}

/** Whether `.with({ relations })` filters `field` of `model`. */
export function isFiltered(model: ModelInfo, field: string): boolean {
	return Object.hasOwn(relationsOf(model), field)
}

/** Fails on a `set` of a filtered relation, which would detach hidden rows. */
export function refuseSet(model: ModelInfo, field: string, path: string): void {
	if (!isFiltered(model, field)) return
	throw new InvalidQuery(
		path,
		`${model.name}.${field} is filtered; use connect and disconnect, not set.`,
	)
}

/** No row passes: a filter that returns `false`. */
const closed: Filter = { OR: [] }
const pending = Symbol('pending')

/** The relation filters of one query, run once each for its caller. */
export class Relations {
	private readonly filters = new Map<
		string,
		Filter | undefined | typeof pending
	>()
	private readonly models: Models
	private readonly caller: Caller
	/** The caller's user id, which `viewer` reads (D-189). */
	readonly viewer: string | undefined

	constructor(models: Models, caller: Caller) {
		this.models = models
		this.caller = caller
		this.viewer = caller.kind === 'user' ? caller.user.id : undefined
	}

	/** The rows of `model.field` its filter keeps; `undefined` for all. */
	filter(model: ModelInfo, field: Many | One): Filter | undefined {
		if (field.kind === 'one' && !viewerViews.has(field)) {
			return viewFilters.get(field)
		}
		const key = `${model.name}.${field.name}`
		const known = this.filters.get(key)
		if (known === pending) {
			throw new TypeError(`${key}: its filter reads the relation itself.`)
		}
		if (this.filters.has(key)) return known
		const rule = relationsOf(model)[field.name]
		this.filters.set(key, pending)
		const filter = isObject(rule)
			? this.run(model, field, rule['where'])
			: undefined
		this.filters.set(key, filter)
		return filter
	}

	private run(
		model: ModelInfo,
		field: Many | One,
		rule: unknown,
	): Filter | undefined {
		const path = `${model.name}.with.relations.${field.name}.where`
		if (typeof rule !== 'function')
			throw new TypeError(`${path} is a function.`)
		const result: unknown = Reflect.apply(rule, undefined, [
			{ caller: this.caller, where: readFilter },
		])
		if (result === true) return undefined
		if (result === false) return closed
		if (!isReadFilter(result)) {
			throw new TypeError(`${path} returns where({ ... }) or a boolean.`)
		}
		const target = modelOf(this.models, field.target)
		// Trusted server code, as a read rule's own filter (D-86).
		return normalizeWhere(
			this.models,
			target,
			filterOf(result),
			path,
			trusted(this),
		)
	}
}

/** The scope of trusted filters: no access rule, relation filters only. */
export function trusted(relations: Relations): Scope {
	return {
		check: () => undefined,
		ruled: () => false,
		readable: () => undefined,
		related: (model, field) => relations.filter(model, field),
		viewer: relations.viewer,
	}
}
