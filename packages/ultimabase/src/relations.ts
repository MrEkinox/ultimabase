// The filter of a `many` relation, from its model's `.with({ relations })`
// (D-151): every read of the relation sees only the rows it keeps, Master's
// too, and a filtered relation takes no `set`.
import type { Filter } from './adapter.ts'
import { InvalidQuery, Refused } from './errors.ts'
import type { Models, Scope } from './query-where.ts'
import { isObject, modelOf, normalizeWhere } from './query-where.ts'
import type { Caller } from './rules.ts'
import { filterOf, isReadFilter, readFilter } from './rules.ts'
import type { FieldInfo, ModelInfo } from './schema.ts'

type Many = Extract<FieldInfo, { readonly kind: 'many' }>

function relationsOf(model: ModelInfo): { readonly [field: string]: unknown } {
	const { rules } = model.definition
	const relations = isObject(rules) ? rules['relations'] : undefined
	return isObject(relations) ? relations : {}
}

/** Stops startup on a filter that names no `many` of the model (D-151). */
export function checkRelations(model: ModelInfo): void {
	for (const [name, rule] of Object.entries(relationsOf(model))) {
		const where = `${model.name}.with.relations.${name}`
		if (model.fields.get(name)?.kind !== 'many') {
			throw new Refused(`${where}: ${name} is not a many relation.`)
		}
		if (!isObject(rule) || typeof rule['where'] !== 'function') {
			throw new Refused(`${where} takes a where function.`)
		}
	}
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

	constructor(models: Models, caller: Caller) {
		this.models = models
		this.caller = caller
	}

	/** The rows of `model.field` its filter keeps; `undefined` for all. */
	filter(model: ModelInfo, field: Many): Filter | undefined {
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
		field: Many,
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
	}
}
