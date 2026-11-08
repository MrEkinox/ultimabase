// Access rules at run time (D-10, D-44, D-86): each model's read filter, the
// fields a caller may not filter on or see, and the rules a write runs.
// Master skips them all (D-48): its queries get no `Access`.
import { fieldValue, recordOf, updatesOnly } from './access-values.ts'
import { InvalidQuery, PublicError } from './errors.ts'
import type { Filter } from './adapter.ts'
import type { Logger } from './app-options.ts'
import { Relations, trusted } from './relations.ts'
import type { Caller } from './rules.ts'
import {
	allow,
	filterOf,
	isMaster,
	isReadFilter,
	readFilter,
	writeFilter,
} from './rules.ts'
import type { ModelInfo } from './schema.ts'
import type { Models, Verb } from './query-where.ts'
import { entries, isObject, modelOf, normalizeWhere } from './query-where.ts'
import type { RowRule } from './write-filter.ts'
import { rowRules } from './write-filter.ts'

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
	const rule = ruleOf(
		accessOf(model.definition.fields.get(field)?.rules),
		operation,
	)
	// Everyone reads through them: no read rule (D-176).
	const open = rule === allow.public || rule === allow.readOnly
	return operation === 'read' && open ? undefined : rule
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
		throw new TypeError('A field rule returns a boolean.')
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
	for (const field of [...model.fields.keys(), ...model.oneOfs.keys()]) {
		const rule = fieldRule(model, field, 'read')
		if (rule !== undefined) {
			rules[field] = rule === allow.private ? 'private' : 'rule'
		}
	}
	// A virtual is hidden by its own rule and by its needs' (D-151).
	for (const { name, needs } of model.virtuals.values()) {
		const own = fieldRule(model, name, 'read')
		const found = [
			...needs.map((need) => rules[need]),
			own === undefined
				? undefined
				: own === allow.private
					? 'private'
					: 'rule',
		]
		if (found.includes('private')) rules[name] = 'private'
		else if (found.includes('rule')) rules[name] = 'rule'
	}
	return rules
}

export { recordOf } from './access-values.ts'

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

/**
 * A write's stored `record`, its `value`, the relation it comes from, and
 * the `id` a create gives its row.
 */
export type Write = {
	readonly record?: Values
	readonly data?: unknown
	readonly via?: string
	readonly id?: string
	/** The row of a write that loads none, by its unique filter (D-342). */
	readonly by?: Filter
}

const unreadable = (): never => {
	throw new Error('A rule read the record of a write that loads no row.')
}

/** The record a rule sees when the write loads no row: reading it fails. */
const unloadedRecord: Values = new Proxy(
	{},
	{
		get: unreadable,
		has: unreadable,
		ownKeys: unreadable,
		getOwnPropertyDescriptor: unreadable,
	},
)

/** The access rules of one query, for a caller other than Master. */
export class Access {
	private readonly filters = new Map<string, Filter | undefined>()
	/** The rows the write rules' filters must match (D-214). */
	private readonly written: RowRule[] = []
	readonly models: Models
	readonly caller: Caller
	private readonly logger: Logger
	/** The query's relation filters (D-151). */
	readonly relations: Relations

	constructor(models: Models, caller: Caller, logger: Logger) {
		this.models = models
		this.caller = caller
		this.logger = logger
		this.relations = new Relations(models, caller)
	}

	/** The model's read filter (D-10); `undefined` when every row passes. */
	readable(name: string): Filter | undefined {
		if (this.filters.has(name)) return this.filters.get(name)
		const filter = this.filterOf(modelOf(this.models, name))
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
			throw new TypeError('A read rule returns a boolean or a filter.')
		}
		// The rule's own filter is trusted: no guard, no other rule (D-86).
		const path = `${model.name}.access.read`
		return normalizeWhere(
			this.models,
			model,
			filterOf(result),
			path,
			trusted(this.relations),
		)
	}

	/** Whether a field read rule may hide the field, from the whole row (D-44). */
	ruled(model: ModelInfo, field: string): boolean {
		return fieldRule(model, field, 'read') !== undefined
	}

	/** Refuses a filter or a sort on a field with a read rule (D-44, D-86). */
	check(model: ModelInfo, field: string, path: string, verb: Verb): void {
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
		const { record } = write
		const stored = record === undefined ? undefined : recordOf(model, record)
		this.judge(model, operation, write, stored, false)
	}

	/**
	 * Runs the rules of a write that loads no row (D-342): true once they
	 * allow it without its stored row; false when one reads the row, refuses
	 * or throws, and the write then loads the row to run them again.
	 */
	allowsUnloaded(
		model: ModelInfo,
		operation: 'update' | 'delete',
		write: { readonly data?: unknown; readonly by: Filter },
	): boolean {
		try {
			return this.judge(model, operation, write, unloadedRecord, true)
		} catch {
			return false
		}
	}

	/** Whether the rules allow the write; a refusal throws unless `probing`. */
	private judge(
		model: ModelInfo,
		operation: Exclude<Operation, 'read'>,
		write: Write,
		record: Values | undefined,
		probing: boolean,
	): boolean {
		const value =
			write.data === undefined
				? undefined
				: Object.fromEntries(entries(write.data, 'data'))
		const facts = {
			caller: this.caller,
			operation,
			...(record === undefined ? {} : { record }),
			...(value === undefined ? {} : { value }),
		}
		const refusal = {
			model: model.name,
			operation,
			...(write.via === undefined ? {} : { via: write.via }),
		}
		const rule = ruleOf(accessOf(model.definition.rules), operation)
		const result =
			rule === undefined ? false : run(rule, { ...facts, where: writeFilter })
		if (result === false) {
			if (probing) return false
			throw denied(refusal, this.caller, this.logger)
		}
		const refuse = () => denied(refusal, this.caller, this.logger)
		const ruled = { result, operation, refuse }
		const { models, relations } = this
		const rows =
			result === true ? [] : rowRules(models, relations, model, write, ruled)
		for (const [field, given] of Object.entries(value ?? {})) {
			const check = fieldRule(model, field, operation)
			if (check === undefined || updatesOnly(model, field, given)) continue
			const allowed = decide(check, {
				...facts,
				value: fieldValue(model, field, given),
			})
			if (allowed) continue
			if (probing) return false
			throw denied({ ...refusal, field }, this.caller, this.logger)
		}
		this.written.push(...rows)
		return true
	}

	/** The rows the write rules' filters must match, taken once (D-214). */
	rowRules(): RowRule[] {
		return this.written.splice(0)
	}

	/** Whether a field has a write rule for `operation` (D-213). */
	rules(
		model: ModelInfo,
		field: string,
		operation: 'create' | 'update',
	): boolean {
		return fieldRule(model, field, operation) !== undefined
	}

	/**
	 * Fails with `ACCESS_DENIED` unless the field's own rule allows a
	 * many-to-many link written from its other side (D-213).
	 */
	allowLink(
		model: ModelInfo,
		field: string,
		operation: 'create' | 'update',
		link: {
			readonly record?: Values
			readonly value: Values
			readonly via: string
		},
	): void {
		const rule = fieldRule(model, field, operation)
		if (rule === undefined) return
		const { record, value, via } = link
		const facts = {
			caller: this.caller,
			operation,
			...(record === undefined ? {} : { record: recordOf(model, record) }),
			value,
		}
		if (decide(rule, facts)) return
		const refusal = { model: model.name, operation, field, via }
		throw denied(refusal, this.caller, this.logger)
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
