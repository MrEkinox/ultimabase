// `create` and `update` data, checked and turned into the adapter's changes:
// values and relation writes by id, from either side (D-20, D-53, D-84).
import type { Filter, Row, ScalarType } from './adapter.ts'
import { InvalidQuery } from './errors.ts'
import type { Caller } from './rules.ts'
import type { FieldInfo, ModelInfo } from './schema.ts'
import { uuidv7 } from './uuid.ts'
import type { Models } from './query-where.ts'
import { entries, isObject, unknownKey } from './query-where.ts'
import type { Reads, Step } from './write-plan.ts'
import { Plan } from './write-plan.ts'

const byId = (id: string): Filter => ({ id: { equals: id } })
const byIds = (ids: readonly string[]): Filter => ({ id: { in: ids } })

function isJson(value: unknown): boolean {
	if (
		value === null ||
		typeof value === 'string' ||
		typeof value === 'boolean'
	) {
		return true
	}
	if (typeof value === 'number') return Number.isFinite(value)
	if (Array.isArray(value)) return value.every(isJson)
	if (!isObject(value) || Object.getPrototypeOf(value) !== Object.prototype) {
		return false
	}
	return Object.values(value).every(isJson)
}

type Scalar = Extract<FieldInfo, { readonly kind: 'scalar' }>

/** Each scalar type's check, and its message when a value does not fit. */
const fits: {
	readonly [T in ScalarType]: (
		value: unknown,
		field: Scalar,
	) => string | undefined
} = {
	string: (value) =>
		typeof value === 'string' ? undefined : 'Expected a string.',
	number: (value) =>
		typeof value === 'number' && Number.isFinite(value)
			? undefined
			: 'Expected a finite number.',
	boolean: (value) =>
		typeof value === 'boolean' ? undefined : 'Expected a boolean.',
	date: (value) =>
		value instanceof Date && !Number.isNaN(value.getTime())
			? undefined
			: 'Expected a valid Date.',
	json: (value) => (isJson(value) ? undefined : 'Expected JSON data.'),
	enum: (value, field) =>
		typeof value === 'string' && (field.values ?? []).includes(value)
			? undefined
			: `Expected one of ${(field.values ?? []).join(', ')}.`,
}

/** `{ id }`, exactly. */
function ref(value: unknown, path: string): string {
	const given = entries(value, path)
	const [first] = given
	if (
		given.length !== 1 ||
		first?.[0] !== 'id' ||
		typeof first[1] !== 'string'
	) {
		throw new InvalidQuery(path, `${path} must be { id }.`)
	}
	return first[1]
}

function refs(value: unknown, path: string): string[] {
	if (!Array.isArray(value))
		throw new InvalidQuery(path, `${path} must be a list.`)
	return value.map((item: unknown, index) => ref(item, `${path}.${index}`))
}

function operations(
	value: unknown,
	path: string,
	model: string,
	allowed: readonly string[],
): Map<string, unknown> {
	if (value === null) {
		throw new InvalidQuery(path, `${path} cannot be null; use disconnect.`)
	}
	const given = new Map(entries(value, path))
	for (const key of given.keys()) {
		if (!allowed.includes(key)) throw unknownKey(`${path}.${key}`, model)
	}
	return given
}

type Context = {
	readonly models: Models
	readonly model: ModelInfo
	readonly id: string
	readonly plan: Plan
	readonly reads: Reads
	readonly set: { [field: string]: unknown }
	/** The steps that run after the row's own. */
	readonly after: Step[]
}

function scalar(context: Context, field: FieldInfo, value: unknown): void {
	if (field.kind !== 'scalar') return
	const issue =
		value === null
			? field.optional
				? undefined
				: 'Required.'
			: fits[field.type](value, field)
	if (issue === undefined) context.set[field.name] = value
	else context.plan.issues.push({ path: [field.name], message: issue })
}

/** Whether a row of the other side, but `kept`, holds this one's key. */
async function holds(
	context: Context,
	field: Extract<FieldInfo, { readonly kind: 'one' }>,
	kept: string | undefined,
): Promise<boolean> {
	const count = await context.reads.count({
		model: field.target,
		where: {
			[field.inverse]: { is: byId(context.id) },
			...(kept === undefined ? {} : { id: { not: kept } }),
		},
	})
	return count > 0
}

async function one(
	context: Context,
	field: Extract<FieldInfo, { readonly kind: 'one' }>,
	value: unknown,
	creating: boolean,
): Promise<void> {
	const path = `data.${field.name}`
	const name = context.model.name
	const given = operations(
		value,
		path,
		name,
		creating ? ['connect'] : ['connect', 'disconnect'],
	)
	if (given.size !== 1) {
		throw new InvalidQuery(
			path,
			`${path} takes connect or disconnect, one of them.`,
		)
	}
	const connect = given.get('connect')
	const target =
		connect === undefined ? undefined : ref(connect, `${path}.connect`)
	if (target === undefined && given.get('disconnect') !== true) {
		throw new InvalidQuery(
			`${path}.disconnect`,
			`${path}.disconnect must be true.`,
		)
	}
	if (target !== undefined) context.plan.connect(field.target, [target])
	if (field.stored) {
		if (target === undefined && !field.optional) {
			context.plan.issues.push({ path: [field.name], message: 'Required.' })
			return
		}
		context.set[field.name] = target ?? null
		return
	}
	// The other side holds a required key (D-37): it cannot be left empty.
	if (!creating && (await holds(context, field, target))) {
		context.plan.issues.push({
			path: [field.name],
			message: `The ${field.target} it points to cannot be left without one.`,
		})
		return
	}
	if (target !== undefined) {
		context.after.push({
			kind: 'move',
			model: field.target,
			field: field.inverse,
			via: `${name}.${field.name}`,
			where: byId(target),
			to: context.id,
		})
	}
}

function many(
	context: Context,
	field: Extract<FieldInfo, { readonly kind: 'many' }>,
	value: unknown,
	creating: boolean,
): void {
	const path = `data.${field.name}`
	const given = operations(
		value,
		path,
		context.model.name,
		creating ? ['connect'] : ['connect', 'disconnect'],
	)
	const connect = given.has('connect')
		? refs(given.get('connect'), `${path}.connect`)
		: []
	const disconnect = given.has('disconnect')
		? refs(given.get('disconnect'), `${path}.disconnect`)
		: []
	context.plan.connect(field.target, connect)
	if (field.join) {
		const link = {
			model: context.model.name,
			field: field.name,
			id: context.id,
		}
		if (disconnect.length > 0) {
			context.after.push({
				kind: 'detach',
				...link,
				targets: disconnect,
				target: field.target,
			})
		}
		if (connect.length > 0) {
			context.after.push({ kind: 'link', ...link, targets: connect })
		}
		return
	}
	const inverse = context.models.get(field.target)?.fields.get(field.inverse)
	const move = {
		kind: 'move',
		model: field.target,
		field: field.inverse,
		via: `${context.model.name}.${field.name}`,
	} as const
	if (disconnect.length > 0) {
		if (inverse?.kind === 'one' && !inverse.optional) {
			context.plan.issues.push({
				path: [field.name, 'disconnect'],
				message: `A ${field.target} cannot be left without its ${field.inverse}.`,
			})
		} else {
			context.after.push({
				...move,
				where: {
					...byIds(disconnect),
					[field.inverse]: { is: byId(context.id) },
				},
				to: null,
			})
		}
	}
	if (connect.length > 0) {
		context.after.push({ ...move, where: byIds(connect), to: context.id })
	}
}

async function fields(
	context: Context,
	data: unknown,
	creating: boolean,
): Promise<Set<string>> {
	const given = new Set<string>()
	for (const [name, value] of entries(data, 'data')) {
		const field = context.model.fields.get(name)
		if (field === undefined)
			throw unknownKey(`data.${name}`, context.model.name)
		given.add(name)
		if (field.kind === 'scalar') scalar(context, field, value)
		else if (field.kind === 'one') await one(context, field, value, creating)
		else many(context, field, value, creating)
	}
	return given
}

/** `create`'s changes: the row with its id, timestamps and defaults (D-22). */
export async function createPlan(
	models: Models,
	model: ModelInfo,
	data: unknown,
	caller: Caller,
	reads: Reads,
): Promise<{ readonly id: string; readonly plan: Plan }> {
	const id = uuidv7()
	const plan = new Plan()
	const context: Context = {
		models,
		model,
		id,
		plan,
		reads,
		set: {},
		after: [],
	}
	const given = await fields(context, data, true)
	for (const field of model.fields.values()) {
		if (given.has(field.name) || field.kind === 'many') continue
		const fallback = field.options['default']
		const value: unknown =
			typeof fallback === 'function'
				? Reflect.apply(fallback, undefined, [{ caller }])
				: fallback
		if (value !== undefined) {
			if (field.kind === 'one')
				await one(context, field, { connect: value }, true)
			else scalar(context, field, value)
		} else if (field.kind === 'scalar' || field.stored) {
			if (field.optional) {
				context.set[field.name] = null
			} else {
				plan.issues.push({ path: [field.name], message: 'Required.' })
			}
		}
	}
	const now = Date.now()
	const row: Row = {
		...context.set,
		id,
		createdAt: new Date(now),
		updatedAt: new Date(now),
	}
	plan.steps.push({ kind: 'insert', model: model.name, row }, ...context.after)
	return { id, plan }
}

/** `update`'s changes on the stored row; `updatedAt` always moves. */
export async function updatePlan(
	models: Models,
	model: ModelInfo,
	id: string,
	data: unknown,
	reads: Reads,
): Promise<Plan> {
	const plan = new Plan()
	const context: Context = {
		models,
		model,
		id,
		plan,
		reads,
		set: {},
		after: [],
	}
	await fields(context, data, false)
	plan.steps.push(
		{
			kind: 'update',
			model: model.name,
			where: byId(id),
			set: { ...context.set, updatedAt: new Date() },
		},
		...context.after,
	)
	return plan
}
