// A write's data after its `before*` hooks, turned into the adapter's
// changes: values and relation writes by id, from either side (D-20, D-78).
// The caller's data was checked before the hooks (write-data.ts): what fails
// here is a hook's or a default's value (D-88).
import type { Filter, Row } from './adapter.ts'
import { InvalidQuery } from './errors.ts'
import { runHook } from './hooks.ts'
import type { FieldInfo, ModelInfo } from './schema.ts'
import type { QueryScope } from './scope.ts'
import { madeId, uuidv7 } from './uuid.ts'
import { entries, unknownKey } from './query-where.ts'
import type { Draft } from './write-data.ts'
import {
	issueOf,
	manyWrite,
	oneWrite,
	prepared,
	readData,
} from './write-data.ts'
import type { Reads, Step } from './write-plan.ts'
import { Plan } from './write-plan.ts'

const byId = (id: string): Filter => ({ id: { equals: id } })
const byIds = (ids: readonly string[]): Filter => ({ id: { in: ids } })

type Relation = Extract<FieldInfo, { readonly kind: 'one' | 'many' }>

type Context = {
	readonly scope: QueryScope
	readonly model: ModelInfo
	readonly id: string
	readonly plan: Plan
	readonly reads: Reads
	/** The data the caller sent, before defaults and hooks. */
	readonly sent: Readonly<Draft>
	readonly set: { [field: string]: unknown }
	/** The steps that run before the row's own: the rows it points to. */
	readonly before: Step[]
	/** The steps that run after the row's own. */
	readonly after: Step[]
	/** Where the row's data sits in the write's `data` (D-128). */
	readonly at: readonly (string | number)[]
}

function fail(context: Context, path: readonly string[], message: string) {
	context.plan.issues.push({ path: [...context.at, ...path], message })
}

const pathOf = (context: Context, name: string): string =>
	['data', ...context.at, name].join('.')

/**
 * A relation value the caller did not send, a default's or a hook's, skips
 * access rules (D-67); `beforeFind` still applies (D-71).
 */
function trusted(context: Context, field: FieldInfo, value: unknown): boolean {
	return (
		!Object.hasOwn(context.sent, field.name) ||
		context.sent[field.name] !== value
	)
}

function scalar(context: Context, field: FieldInfo, value: unknown): void {
	if (field.kind !== 'scalar') return
	if (value === null) {
		if (field.optional) context.set[field.name] = null
		else fail(context, [field.name], 'Required.')
		return
	}
	const { codec } = field
	// A plugin field is stored in the form its `encode` gives (D-122).
	const stored = codec === undefined ? value : codec.encode(value)
	const issue = issueOf(stored, field)
	const where = `${context.model.name}.${field.name}`
	if (issue !== undefined) {
		throw new TypeError(
			codec === undefined
				? `${where}: ${issue} A before hook or validate wrote it.`
				: `${where}: the ${codec.plugin} field type encoded a value its stored field refuses: ${issue}`,
		)
	}
	context.set[field.name] = stored
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
	const model = scope.models.get(field.target)
	if (model === undefined) throw new Error(`Unknown model ${field.target}.`)
	const made = madeId(data)
	// A hook's data may come back in another write: it gets a fresh id.
	const id = skips || plan.made.has(made) ? uuidv7() : made
	const path = ['data', ...at].join('.')
	const draft = readData(scope.models, model, data, true, path, field.inverse)
	const inverse = model.fields.get(field.inverse)
	if (inverse?.kind === 'one' && inverse.stored) {
		draft[field.inverse] = { connect: { id: context.id } }
	}
	const sent: Readonly<Draft> = skips ? {} : { ...draft }
	if (!skips) scope.access?.allow(model, 'create', { data: sent })
	await prepared(model, draft, scope.caller, true, at)
	await runHook(model, 'beforeCreate', { caller: scope.caller, data: draft })
	plan.events.push({ model, operation: 'create', id })
	const child = { ...context, model, id, sent, set: {}, at }
	const steps = await inserted({ ...child, before: [], after: [] }, draft)
	return { id, steps }
}

async function one(
	context: Context,
	field: Extract<FieldInfo, { readonly kind: 'one' }>,
	value: unknown,
	creating: boolean,
): Promise<void> {
	const name = context.model.name
	const write = oneWrite(value, pathOf(context, field.name), name, creating)
	const skips = trusted(context, field, value)
	// A key the other side holds changes its row: it is updated (D-124).
	const operation = field.stored ? 'read' : 'update'
	let target = typeof write === 'string' ? write : undefined
	if (target !== undefined) {
		context.plan.connect(field.target, [target], skips, operation)
	}
	if (typeof write === 'object') {
		const at = [...context.at, field.name, 'create']
		const made = await created(context, field, write, at, skips)
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
	// The other side holds a required key (D-37): it cannot be left empty.
	if (!creating && (await holds(context, field, target))) {
		fail(
			context,
			[field.name],
			`The ${field.target} it points to cannot be left without one.`,
		)
		return
	}
	if (typeof write === 'string') {
		context.after.push({
			kind: 'move',
			model: field.target,
			field: field.inverse,
			via: `${name}.${field.name}`,
			where: byId(write),
			to: context.id,
			trusted: skips,
		})
	}
}

async function many(
	context: Context,
	field: Extract<FieldInfo, { readonly kind: 'many' }>,
	value: unknown,
	creating: boolean,
): Promise<void> {
	const path = pathOf(context, field.name)
	const name = context.model.name
	const { connect, disconnect, create } = manyWrite(value, path, name, creating)
	const skips = trusted(context, field, value)
	const operation = field.join ? 'read' : 'update'
	context.plan.connect(field.target, connect, skips, operation)
	const made: string[] = []
	for (const [index, data] of create.entries()) {
		const at = [...context.at, field.name, 'create', index]
		const child = await created(context, field, data, at, skips)
		made.push(child.id)
		context.after.push(...child.steps)
	}
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
				trusted: skips,
			})
		}
		const targets = [...connect, ...made]
		if (targets.length > 0) {
			context.after.push({ kind: 'link', ...link, targets })
		}
		return
	}
	const inverse = context.scope.models
		.get(field.target)
		?.fields.get(field.inverse)
	const move = {
		kind: 'move',
		model: field.target,
		field: field.inverse,
		via: `${context.model.name}.${field.name}`,
		trusted: skips,
	} as const
	if (disconnect.length > 0) {
		if (inverse?.kind === 'one' && !inverse.optional) {
			fail(
				context,
				[field.name, 'disconnect'],
				`A ${field.target} cannot be left without its ${field.inverse}.`,
			)
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
	data: Draft,
	creating: boolean,
): Promise<Set<string>> {
	const given = new Set<string>()
	try {
		const at = ['data', ...context.at].join('.')
		for (const [name, value] of entries(data, at)) {
			const field = context.model.fields.get(name)
			if (field === undefined) {
				throw unknownKey(pathOf(context, name), context.model.name)
			}
			given.add(name)
			if (field.kind === 'scalar') scalar(context, field, value)
			else if (field.kind === 'one') await one(context, field, value, creating)
			else await many(context, field, value, creating)
		}
	} catch (error) {
		if (!(error instanceof InvalidQuery)) throw error
		throw new TypeError(
			`${context.model.name}: a before hook wrote invalid data. ${error.message}`,
			{ cause: error },
		)
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

/** `create`'s changes: the row with its id and timestamps (D-22). */
export async function createPlan(
	scope: QueryScope,
	model: ModelInfo,
	draft: Draft,
	sent: Readonly<Draft>,
	reads: Reads,
): Promise<{ readonly id: string; readonly plan: Plan }> {
	const context = contextOf(scope, model, uuidv7(), sent, reads)
	context.plan.steps.push(...(await inserted(context, draft)))
	return { id: context.id, plan: context.plan }
}

/** `update`'s changes on the stored row; `updatedAt` always moves. */
export async function updatePlan(
	scope: QueryScope,
	model: ModelInfo,
	id: string,
	draft: Draft,
	sent: Readonly<Draft>,
	reads: Reads,
): Promise<Plan> {
	const context = contextOf(scope, model, id, sent, reads)
	await fields(context, draft, false)
	context.plan.steps.push(
		...context.before,
		{
			kind: 'update',
			model: model.name,
			where: byId(id),
			set: { ...context.set, updatedAt: new Date(Date.now()) },
		},
		...context.after,
	)
	return context.plan
}
