// A write's data after its `before*` hooks, turned into the adapter's
// changes: values and relation writes by id, from either side (D-20, D-78),
// and the rows its relation writes create, update and delete (D-128, D-138).
// The caller's data was checked before the hooks (write-data.ts): what fails
// here is a hook's or a default's value (D-88).
import { recordOf } from './access.ts'
import type { Row } from './adapter.ts'
import { InvalidQuery } from './errors.ts'
import { runHook } from './hooks.ts'
import { resolveData, resolveMany, resolveOne } from './nested-write.ts'
import type { Numbers } from './number-update.ts'
import type { FieldInfo, ModelInfo } from './schema.ts'
import type { QueryScope } from './scope.ts'
import { madeId, uuidv7 } from './uuid.ts'
import { byId, entries, modelOf, unknownKey } from './query-where.ts'
import type { Context, Relation } from './write-context.ts'
import {
	fail,
	holds,
	linking,
	pathOf,
	resolving,
	scalar,
	trusted,
	viaOf,
} from './write-context.ts'
import type { Draft } from './write-data.ts'
import { prepared, readData } from './write-data.ts'
import type { Reads, Step } from './write-plan.ts'
import { Plan } from './write-plan.ts'

/**
 * A row a relation write creates, as `Target.create` creates it (D-128):
 * its access rules unless a hook or a default wrote it, its defaults, its
 * validation and `beforeCreate`, then its own relation writes.
 */
async function created(
	context: Context,
	field: Relation,
	data: Draft,
	at: readonly (string | number)[],
	skips: boolean,
): Promise<{ readonly id: string; readonly steps: Step[] }> {
	const { scope, plan } = context
	const model = modelOf(context.scope.models, field.target)
	const made = madeId(data)
	// A hook's data may come back in another write: it gets a fresh id.
	const id = skips || plan.made.has(made) ? uuidv7() : made
	const path = ['data', ...at].join('.')
	const draft = readData(scope.models, model, data, true, path, field.inverse)
	const inverse = model.fields.get(field.inverse)
	if (inverse?.kind === 'one' && inverse.stored) {
		draft[field.inverse] = { connect: { id: context.id } }
	}
	const child = { ...context, model, id, set: {}, at }
	await resolveData(resolving(child, skips, true), draft)
	const sent: Readonly<Draft> = skips ? {} : { ...draft }
	if (!skips) scope.access?.allow(model, 'create', { data: sent })
	await prepared(model, draft, scope.caller, true, at)
	await runHook(model, 'beforeCreate', { caller: scope.caller, data: draft })
	plan.events.push({ model, operation: 'create', id })
	const steps = await inserted({ ...child, sent, before: [], after: [] }, draft)
	return { id, steps }
}

/**
 * A linked row a relation write updates, as `Target.update` updates it
 * (D-138): its rules unless a hook or a default wrote it, its validation,
 * `beforeUpdate`, then its own relation writes.
 */
async function changed(
	context: Context,
	field: Relation,
	update: { readonly data: Draft; readonly row: Row },
	at: readonly (string | number)[],
	skips: boolean,
): Promise<Step[]> {
	const { scope, plan } = context
	const { data, row } = update
	const model = modelOf(context.scope.models, field.target)
	const child = { ...context, model, id: row.id, set: {}, at }
	await resolveData(resolving(child, skips, false), data)
	const sent: Readonly<Draft> = skips ? {} : { ...data }
	const via = viaOf(context, field)
	if (!skips)
		scope.access?.allow(model, 'update', { record: row, data: sent, via })
	await prepared(model, data, scope.caller, false, at)
	const record = recordOf(model, row)
	await runHook(model, 'beforeUpdate', { caller: scope.caller, record, data })
	plan.events.push({ model, operation: 'update', id: row.id, before: row })
	return updateSteps({ ...child, sent, before: [], after: [] }, data)
}

/** A linked row a relation write deletes, as `Target.delete` (D-138). */
function dropped(
	context: Context,
	field: Relation,
	row: Row,
	path: string,
	skips: boolean,
): Step {
	const model = modelOf(context.scope.models, field.target)
	const via = viaOf(context, field)
	if (!skips) context.scope.access?.allow(model, 'delete', { record: row, via })
	// The parent empties its own key to the row: the cascade leaves it.
	const except =
		field.kind === 'one' && field.stored
			? { model: context.model.name, field: field.name, id: context.id }
			: undefined
	return {
		kind: 'drop',
		model: model.name,
		rows: [row],
		path,
		...(except === undefined ? {} : { except }),
		written: context.plan.written,
	}
}

async function one(
	context: Context,
	field: Extract<FieldInfo, { readonly kind: 'one' }>,
	value: unknown,
	creating: boolean,
): Promise<void> {
	const skips = trusted(context, field, value)
	const write = await resolveOne(
		resolving(context, skips, creating),
		field,
		value,
	)
	const at = [...context.at, field.name, write.kind]
	if (write.kind === 'update') {
		context.after.push(...(await changed(context, field, write, at, skips)))
		return
	}
	if (write.kind === 'delete') {
		context.after.push(
			dropped(
				context,
				field,
				write.row,
				`${pathOf(context, field.name)}.delete`,
				skips,
			),
		)
	}
	// A key the other side holds changes its row: it is updated (D-124).
	const operation = field.stored ? 'read' : 'update'
	let target = write.kind === 'connect' ? write.id : undefined
	if (target !== undefined) {
		context.plan.connect(field.target, [target], skips, operation)
	}
	if (write.kind === 'create') {
		const made = await created(context, field, write.data, write.at, skips)
		target = made.id
		// The row that stores the key is written after the row it points to.
		;(field.stored ? context.before : context.after).push(...made.steps)
	}
	if (field.stored) {
		if (target === undefined && !field.optional) {
			fail(context, [field.name], 'Required.')
			return
		}
		context.set[field.name] = target ?? null
		return
	}
	// A deleted row holds no key; another one may not be left empty (D-37).
	if (write.kind === 'delete') return
	if (!creating && (await holds(context, field, target))) {
		fail(
			context,
			[field.name],
			`The ${field.target} it points to cannot be left without one.`,
		)
		return
	}
	if (write.kind === 'connect') {
		context.after.push({
			kind: 'move',
			model: field.target,
			field: field.inverse,
			via: viaOf(context, field),
			where: byId(write.id),
			to: context.id,
			trusted: skips,
		})
	}
}

/** Deletes, then creates, disconnects and connects, then updates (D-138). */
async function many(
	context: Context,
	field: Extract<FieldInfo, { readonly kind: 'many' }>,
	value: unknown,
	creating: boolean,
): Promise<void> {
	const skips = trusted(context, field, value)
	const write = await resolveMany(
		resolving(context, skips, creating),
		field,
		value,
	)
	const operation = field.join ? 'read' : 'update'
	context.plan.connect(field.target, write.connect, skips, operation)
	for (const { row, path } of write.delete) {
		context.after.push(dropped(context, field, row, path, skips))
	}
	const made: string[] = []
	for (const { data, at } of write.create) {
		const child = await created(context, field, data, at, skips)
		made.push(child.id)
		context.after.push(...child.steps)
	}
	linking(context, field, write, made, skips)
	for (const [index, update] of write.update.entries()) {
		const at = [...context.at, field.name, 'update', index, 'data']
		context.after.push(...(await changed(context, field, update, at, skips)))
	}
}

/** A hook's value the plan refuses is the hook's error, not the caller's. */
function hookError(context: Context, error: unknown): unknown {
	if (!(error instanceof InvalidQuery)) return error
	return new TypeError(
		`${context.model.name}: a before hook wrote invalid data. ${error.message}`,
		{ cause: error },
	)
}

async function fields(
	context: Context,
	data: Draft,
	creating: boolean,
): Promise<Set<string>> {
	const given = new Set<string>()
	const at = ['data', ...context.at].join('.')
	for (const [name, value] of entries(data, at)) {
		const field = context.model.fields.get(name)
		// The caller's data was read before the hooks: a hook wrote the key.
		if (field === undefined) {
			throw hookError(
				context,
				unknownKey(pathOf(context, name), context.model.name),
			)
		}
		given.add(name)
		try {
			if (field.kind === 'scalar') scalar(context, field, value)
			else if (field.kind === 'one') await one(context, field, value, creating)
			else await many(context, field, value, creating)
		} catch (error) {
			// The caller's relation value reaches rows only now (D-138).
			throw trusted(context, field, value) ? hookError(context, error) : error
		}
	}
	return given
}

function contextOf(
	scope: QueryScope,
	model: ModelInfo,
	id: string,
	sent: Readonly<Draft>,
	reads: Reads,
): Context {
	const plan = new Plan()
	const set = {}
	return {
		scope,
		model,
		id,
		plan,
		reads,
		sent,
		set,
		before: [],
		after: [],
		at: [],
	}
}

/** A created row's steps: the rows it points to, its insert, then the rest. */
async function inserted(context: Context, draft: Draft): Promise<Step[]> {
	const { model, id, plan } = context
	plan.made.add(id)
	const given = await fields(context, draft, true)
	for (const field of model.fields.values()) {
		if (given.has(field.name) || field.kind === 'many') continue
		if (field.kind === 'one' && !field.stored) continue
		// A required field may be left to a hook: checked after it (D-88).
		// A list left unwritten is empty (D-120).
		if (field.kind === 'scalar' && field.list) {
			context.set[field.name] = []
		} else if (field.optional) context.set[field.name] = null
		else fail(context, [field.name], 'Required.')
	}
	const now = Date.now()
	const row: Row = {
		...context.set,
		id,
		createdAt: new Date(now),
		updatedAt: new Date(now),
	}
	const insert = { kind: 'insert', model: model.name, row } as const
	return [...context.before, insert, ...context.after]
}

/** An updated row's steps; `updatedAt` always moves. */
async function updateSteps(
	context: Context,
	draft: Draft,
	numbers: Numbers = new Map(),
): Promise<Step[]> {
	const { model, id, plan } = context
	plan.written.add(`${model.name}:${id}`)
	await fields(context, draft, false)
	return [
		...context.before,
		{
			kind: 'update',
			model: model.name,
			where: byId(id),
			set: { ...context.set, updatedAt: new Date(Date.now()) },
			...(numbers.size === 0 ? {} : { compute: Object.fromEntries(numbers) }),
		},
		...context.after,
	]
}

/** `create`'s changes: the row with its id and timestamps (D-22). */
export async function createPlan(
	scope: QueryScope,
	model: ModelInfo,
	draft: Draft,
	sent: Readonly<Draft>,
	reads: Reads,
	id: string = uuidv7(),
): Promise<{ readonly id: string; readonly plan: Plan }> {
	const context = contextOf(scope, model, id, sent, reads)
	context.plan.steps.push(...(await inserted(context, draft)))
	return { id: context.id, plan: context.plan }
}

/** `update`'s changes on the stored row. */
export async function updatePlan(
	scope: QueryScope,
	model: ModelInfo,
	id: string,
	draft: Draft,
	sent: Readonly<Draft>,
	reads: Reads,
	numbers: Numbers = new Map(),
): Promise<Plan> {
	const context = contextOf(scope, model, id, sent, reads)
	context.plan.steps.push(...(await updateSteps(context, draft, numbers)))
	return context.plan
}
