// Access rules at run time (D-10, D-44, D-86): each model's read filter, the
// fields a caller may not filter on or see, and the rules a write runs.
// Master skips them all (D-48): its queries get no `Access`.
import { InvalidQuery, PublicError } from './errors.ts'
import type { Filter } from './adapter.ts'
import type { Logger } from './app-options.ts'
import type { Caller } from './rules.ts'
import { allow, filterOf, isMaster, isReadFilter, readFilter } from './rules.ts'
import type { ModelInfo } from './schema.ts'
import type { Models } from './query-where.ts'
import { entries, isObject, normalizeWhere } from './query-where.ts'
import { madeId } from './uuid.ts'

type Operation = 'read' | 'create' | 'update' | 'delete'
type Values = { readonly [field: string]: unknown }

/** The `access` a `.with` received, on a model or a field. */
function accessOf(rules: object | undefined): unknown {
	return rules !== undefined && isObject(rules) ? rules['access'] : undefined
}

/** The rule of `operation`: a function covers all, `write` the writes. */
function ruleOf(access: unknown, operation: Operation): unknown {
	if (!isObject(access)) return access
	const rule = access[operation]
	return rule === undefined && operation !== 'read' ? access['write'] : rule
}

function fieldRule(
	model: ModelInfo,
	field: string,
	operation: Operation,
): unknown {
	return ruleOf(accessOf(model.definition.fields.get(field)?.rules), operation)
}

function run(rule: unknown, facts: object): unknown {
	if (typeof rule !== 'function') {
		throw new TypeError('An access rule is a function.')
	}
	const result: unknown = Reflect.apply(rule, undefined, [facts])
	return result
}

function decide(rule: unknown, facts: object): boolean {
	const result = run(rule, facts)
	if (typeof result !== 'boolean') {
		throw new TypeError('A write rule or a field rule returns a boolean.')
	}
	return result
}

/**
 * Each field with a read rule: `private` when only Master reads it, which a
 * transport leaves out, `rule` when it may be hidden (D-44, D-107).
 */
export function readRules(model: ModelInfo): {
	readonly [field: string]: 'private' | 'rule'
} {
	const rules: { [field: string]: 'private' | 'rule' } = {}
	for (const field of model.fields.keys()) {
		const rule = fieldRule(model, field, 'read')
		if (rule !== undefined) {
			rules[field] = rule === allow.private ? 'private' : 'rule'
		}
	}
	return rules
}

/** The record a rule sees: each stored `one` key as `{ id }` or `null` (D-77). */
export function recordOf(model: ModelInfo, row: Values): Values {
	const record: { [field: string]: unknown } = {
		id: row['id'],
		createdAt: row['createdAt'],
		updatedAt: row['updatedAt'],
	}
	for (const field of model.fields.values()) {
		const value = row[field.name]
		if (field.kind === 'scalar') record[field.name] = value ?? null
		else if (field.kind === 'one' && field.stored) {
			record[field.name] = isObject(value) ? { id: value['id'] } : null
		}
	}
	return record
}

function ids(value: unknown, key: string): { readonly id: unknown }[] {
	const list = isObject(value) ? value[key] : undefined
	return Array.isArray(list)
		? list.map((item: unknown) => ({ id: isObject(item) ? item['id'] : null }))
		: []
}

/** The value a field rule sees (D-44, D-86): a relation's ids, not its data. */
function fieldValue(model: ModelInfo, name: string, given: unknown): unknown {
	const kind = model.fields.get(name)?.kind
	const create = isObject(given) ? given['create'] : undefined
	if (kind === 'many') {
		return {
			connect: ids(given, 'connect'),
			disconnect: ids(given, 'disconnect'),
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

const closed: Filter = { OR: [] }

/** A write a rule refused, named as D-82 asks. */
type Refusal = {
	readonly model: string
	readonly operation: Operation
	readonly field?: string
	readonly via?: string
}

/** A refusal, logged with the caller's id before it is thrown (D-88). */
export function refused(
	details: { readonly [key: string]: string },
	message: string,
	caller: Caller,
	logger: Logger,
): PublicError {
	const callerId = caller.kind === 'user' ? caller.user.id : null
	logger.warn({ ...details, callerId }, message)
	return new PublicError('ACCESS_DENIED', message, { details })
}

function denied(refusal: Refusal, caller: Caller, logger: Logger): PublicError {
	const { model, operation, field, via } = refusal
	const details = {
		model,
		operation,
		...(field === undefined ? {} : { field }),
		...(via === undefined ? {} : { via }),
	}
	return refused(details, `${model} ${operation} refused.`, caller, logger)
}

/** A write's stored `record`, its `value`, and the relation it comes from. */
export type Write = {
	readonly record?: Values
	readonly data?: unknown
	readonly via?: string
}

/** The access rules of one query, for a caller other than Master. */
export class Access {
	private readonly filters = new Map<string, Filter | undefined>()
	readonly models: Models
	readonly caller: Caller
	private readonly logger: Logger

	constructor(models: Models, caller: Caller, logger: Logger) {
		this.models = models
		this.caller = caller
		this.logger = logger
	}

	/** The model's read filter (D-10); `undefined` when every row passes. */
	readable(name: string): Filter | undefined {
		if (this.filters.has(name)) return this.filters.get(name)
		const model = this.models.get(name)
		if (model === undefined) throw new Error(`Unknown model ${name}.`)
		const filter = this.filterOf(model)
		this.filters.set(name, filter)
		return filter
	}

	private filterOf(model: ModelInfo): Filter | undefined {
		const rule = ruleOf(accessOf(model.definition.rules), 'read')
		// Closed by default (D-04).
		if (rule === undefined) return closed
		const result = run(rule, {
			caller: this.caller,
			operation: 'read',
			where: readFilter,
		})
		if (result === true) return undefined
		if (result === false) return closed
		if (!isReadFilter(result)) {
			throw new TypeError('A read rule returns a boolean or a read filter.')
		}
		// The rule's own filter is trusted: no guard, no other rule (D-86).
		const path = `${model.name}.access.read`
		return normalizeWhere(this.models, model, filterOf(result), path)
	}

	/** Whether a field read rule may hide the field, from the whole row (D-44). */
	ruled(model: ModelInfo, field: string): boolean {
		return fieldRule(model, field, 'read') !== undefined
	}

	/** Refuses a filter or a sort on a field with a read rule (D-44, D-86). */
	check(
		model: ModelInfo,
		field: string,
		path: string,
		verb: 'filters' | 'sorts',
	): void {
		if (fieldRule(model, field, 'read') === undefined) return
		throw new InvalidQuery(
			path,
			`${path}: ${model.name}.${field} has a read rule; only Master ${verb} on it.`,
		)
	}

	/** The fields of a row its field read rules hide (D-44). */
	hidden(
		model: ModelInfo,
		row: Values,
		fields: Iterable<string>,
	): ReadonlySet<string> {
		const hidden = new Set<string>()
		let record: Values | undefined
		for (const field of fields) {
			const rule = fieldRule(model, field, 'read')
			if (rule === undefined) continue
			record ??= recordOf(model, row)
			const facts = { caller: this.caller, operation: 'read', record }
			if (!decide(rule, facts)) hidden.add(field)
		}
		return hidden
	}

	/**
	 * Fails with `ACCESS_DENIED` unless the model's rule, then each written
	 * field's rule, allows the write (D-10, D-44, D-67).
	 */
	allow(
		model: ModelInfo,
		operation: Exclude<Operation, 'read'>,
		write: Write,
	): void {
		const value =
			write.data === undefined
				? undefined
				: Object.fromEntries(entries(write.data, 'data'))
		const facts = {
			caller: this.caller,
			operation,
			...(write.record === undefined
				? {}
				: { record: recordOf(model, write.record) }),
			...(value === undefined ? {} : { value }),
		}
		const refusal = {
			model: model.name,
			operation,
			...(write.via === undefined ? {} : { via: write.via }),
		}
		const rule = ruleOf(accessOf(model.definition.rules), operation)
		if (rule === undefined || !decide(rule, facts))
			throw denied(refusal, this.caller, this.logger)
		for (const [field, given] of Object.entries(value ?? {})) {
			const check = fieldRule(model, field, operation)
			if (check === undefined) continue
			const allowed = decide(check, {
				...facts,
				value: fieldValue(model, field, given),
			})
			if (!allowed) {
				throw denied({ ...refusal, field }, this.caller, this.logger)
			}
		}
	}
}

/** The query's access rules; `undefined` for Master, which skips them. */
export function accessFor(
	models: Models,
	caller: Caller,
	logger: Logger,
): Access | undefined {
	return isMaster(caller) ? undefined : new Access(models, caller, logger)
}

/** `filter` and the model's read filter, both. */
export function and(filter: Filter, readable: Filter | undefined): Filter
export function and(filter: Filter | undefined, readable: Filter): Filter
export function and(
	filter: Filter | undefined,
	readable: Filter | undefined,
): Filter | undefined
export function and(
	filter: Filter | undefined,
	readable: Filter | undefined,
): Filter | undefined {
	if (readable === undefined) return filter
	return filter === undefined ? readable : { AND: [readable, filter] }
}
