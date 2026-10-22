// A write's data after its `before*` hooks, turned into the adapter's
// changes: values and relation writes by id, from either side (D-20, D-78).
// The caller's data was checked before the hooks (write-data.ts): what fails
// here is a hook's or a default's value (D-88).
import type { Filter, Row } from './adapter.ts'
import { InvalidQuery } from './errors.ts'
import type { FieldInfo, ModelInfo } from './schema.ts'
import { uuidv7 } from './uuid.ts'
import type { Models } from './query-where.ts'
import { entries, unknownKey } from './query-where.ts'
import type { Draft } from './write-data.ts'
import { fits, manyWrite, oneWrite } from './write-data.ts'
import type { Reads, Step } from './write-plan.ts'
import { Plan } from './write-plan.ts'

const byId = (id: string): Filter => ({ id: { equals: id } })
const byIds = (ids: readonly string[]): Filter => ({ id: { in: ids } })

type Context = {
	readonly models: Models
	readonly model: ModelInfo
	readonly id: string
	readonly plan: Plan
	readonly reads: Reads
	/** The data the caller sent, before defaults and hooks. */
	readonly sent: Readonly<Draft>
	readonly set: { [field: string]: unknown }
	/** The steps that run after the row's own. */
	readonly after: Step[]
}

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
		else context.plan.issues.push({ path: [field.name], message: 'Required.' })
		return
	}
	const issue = fits[field.type](value, field)
	if (issue !== undefined) {
		throw new TypeError(
			`${context.model.name}.${field.name}: ${issue} A before hook or validate wrote it (D-88).`,
		)
	}
	context.set[field.name] = value
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
	const name = context.model.name
	const target = oneWrite(value, `data.${field.name}`, name, creating)
	const skips = trusted(context, field, value)
	if (target !== undefined) context.plan.connect(field.target, [target], skips)
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
			trusted: skips,
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
	const { connect, disconnect } = manyWrite(
		value,
		path,
		context.model.name,
		creating,
	)
	const skips = trusted(context, field, value)
	context.plan.connect(field.target, connect, skips)
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
		trusted: skips,
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
	data: Draft,
	creating: boolean,
): Promise<Set<string>> {
	const given = new Set<string>()
	try {
		for (const [name, value] of entries(data, 'data')) {
			const field = context.model.fields.get(name)
			if (field === undefined) {
				throw unknownKey(`data.${name}`, context.model.name)
			}
			given.add(name)
			if (field.kind === 'scalar') scalar(context, field, value)
			else if (field.kind === 'one') await one(context, field, value, creating)
			else many(context, field, value, creating)
		}
	} catch (error) {
		if (!(error instanceof InvalidQuery)) throw error
		throw new TypeError(
			`${context.model.name}: a before hook wrote invalid data (D-88). ${error.message}`,
			{ cause: error },
		)
	}
	return given
}

function contextOf(
	models: Models,
	model: ModelInfo,
	id: string,
	sent: Readonly<Draft>,
	reads: Reads,
): Context {
	return {
		models,
		model,
		id,
		plan: new Plan(),
		reads,
		sent,
		set: {},
		after: [],
	}
}

/** `create`'s changes: the row with its id and timestamps (D-22). */
export async function createPlan(
	models: Models,
	model: ModelInfo,
	draft: Draft,
	sent: Readonly<Draft>,
	reads: Reads,
): Promise<{ readonly id: string; readonly plan: Plan }> {
	const id = uuidv7()
	const context = contextOf(models, model, id, sent, reads)
	const { plan } = context
	const given = await fields(context, draft, true)
	for (const field of model.fields.values()) {
		if (given.has(field.name) || field.kind === 'many') continue
		if (field.kind === 'one' && !field.stored) continue
		// A required field may be left to a hook: checked after it (D-88).
		if (field.optional) context.set[field.name] = null
		else plan.issues.push({ path: [field.name], message: 'Required.' })
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
	draft: Draft,
	sent: Readonly<Draft>,
	reads: Reads,
): Promise<Plan> {
	const context = contextOf(models, model, id, sent, reads)
	await fields(context, draft, false)
	context.plan.steps.push(
		{
			kind: 'update',
			model: model.name,
			where: byId(id),
			set: { ...context.set, updatedAt: new Date() },
		},
		...context.after,
	)
	return context.plan
}
