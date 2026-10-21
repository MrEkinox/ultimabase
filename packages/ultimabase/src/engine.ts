// The running application and the queries its models send (D-18): each one
// checked, run on the adapter and returned in the shape it asked for.
import type { Adapter, Filter, Row } from './adapter.ts'
import { UniqueViolation } from './adapter.ts'
import { InvalidQuery, PublicError } from './errors.ts'
import type { Caller } from './rules.ts'
import { isMaster } from './rules.ts'
import type { ModelInfo, Resolved } from './schema.ts'
import type { Shape } from './query-args.ts'
import { plan, project, uniqueWhere } from './query-args.ts'
import { entries, isObject, unknownKey } from './query-where.ts'
import { createPlan, updatePlan } from './query-write.ts'

export type Operation =
	| 'findMany'
	| 'findFirst'
	| 'findUnique'
	| 'count'
	| 'create'
	| 'update'
	| 'delete'

type Running = { readonly resolved: Resolved; readonly adapter: Adapter }

/** One running application per realm (D-18). */
let running: Running | undefined

export function register(app: Running): void {
	if (running !== undefined) {
		throw new Error('An application is already running; stop it first.')
	}
	running = app
}

export function unregister(app: Running): void {
	if (running === app) running = undefined
}

const anonymous: Caller = Object.freeze({ kind: 'anonymous' })

/** `{ as }` only; without it, the caller is anonymous (D-19). */
function callerOf(options: unknown, model: string): Caller {
	if (options === undefined) return anonymous
	const keys = new Map(entries(options, 'options'))
	for (const key of keys.keys()) {
		if (key !== 'as') throw unknownKey(`options.${key}`, model)
	}
	const caller = keys.get('as')
	if (caller === undefined) return anonymous
	if (!isObject(caller)) {
		throw new InvalidQuery('options.as', 'options.as must be a caller.')
	}
	switch (caller['kind']) {
		case 'anonymous':
			return anonymous
		case 'user':
			if (
				!isObject(caller['user']) ||
				typeof caller['user']['id'] !== 'string'
			) {
				throw new InvalidQuery('options.as', 'options.as.user must be { id }.')
			}
			// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the kernel reads only the id; the record's other fields are the server code's.
			return caller as Caller
		case 'master':
			// Only the kernel creates Master (D-19): a copy is a forgery.
			if (!isMaster(caller)) {
				throw new Error('options.as is a Master the kernel did not create.')
			}
			return caller
		default:
			throw new InvalidQuery('options.as', 'options.as must be a caller.')
	}
}

function given(
	args: unknown,
	model: string,
	keys: readonly string[],
	required: readonly string[],
): Map<string, unknown> {
	const found = new Map(args === undefined ? [] : entries(args, 'args'))
	for (const key of found.keys()) {
		if (!keys.includes(key)) throw unknownKey(key, model)
	}
	for (const key of required) {
		if (!found.has(key)) throw new InvalidQuery(key, `${key} is required.`)
	}
	return found
}

/** `select` and `include` of a single-row operation. */
function picked(found: ReadonlyMap<string, unknown>): object {
	const args: { [key: string]: unknown } = {}
	for (const key of ['select', 'include']) {
		if (found.has(key)) args[key] = found.get(key)
	}
	return args
}

const byId = (id: string): Filter => ({ id: { equals: id } })

function first(rows: readonly Row[], shape: Shape): unknown {
	const [row] = rows
	return row === undefined ? null : project(row, shape)
}

async function write(
	adapter: Adapter,
	run: (adapter: Adapter) => Promise<Row[]>,
): Promise<Row[]> {
	try {
		return await run(adapter)
	} catch (error) {
		if (error instanceof UniqueViolation) {
			throw new PublicError('UNIQUE_VIOLATION', error.message, {
				details: { model: error.model, fields: [...error.fields] },
				cause: error,
			})
		}
		throw error
	}
}

const manyKeys = [
	'where',
	'select',
	'include',
	'orderBy',
	'take',
	'skip',
	'cursor',
]

/**
 * Before access rules land, only Master passes: other callers read nothing
 * and write nothing (D-04).
 */
async function find(
	context: Context,
	args: unknown,
	single: boolean,
): Promise<unknown> {
	const { resolved, adapter, model, caller } = context
	const { read, shape } = plan(
		resolved.models,
		model,
		args,
		'',
		'many',
		new Set(manyKeys),
	)
	const take = read.take ?? 1
	const limited = single ? { ...read, take: Math.sign(take) } : read
	if (!isMaster(caller)) return single ? null : []
	const rows = await adapter.find({ model: model.name, ...limited })
	return single ? first(rows, shape) : rows.map((row) => project(row, shape))
}

type Context = Running & {
	readonly model: ModelInfo
	readonly caller: Caller
}

async function findUnique(context: Context, args: unknown): Promise<unknown> {
	const { resolved, adapter, model, caller } = context
	const found = given(
		args,
		model.name,
		['where', 'select', 'include'],
		['where'],
	)
	const where = uniqueWhere(resolved.models, model, found.get('where'), 'where')
	const { read, shape } = plan(
		resolved.models,
		model,
		picked(found),
		'',
		'one',
		new Set(['select', 'include']),
	)
	if (!isMaster(caller)) return null
	return first(await adapter.find({ model: model.name, ...read, where }), shape)
}

async function count(context: Context, args: unknown): Promise<number> {
	const { resolved, adapter, model, caller } = context
	const found = given(args, model.name, ['where'], [])
	const { read } = plan(
		resolved.models,
		model,
		Object.fromEntries(found),
		'',
		'one',
		new Set(['where']),
	)
	if (!isMaster(caller)) return 0
	return adapter.count({
		model: model.name,
		...(read.where === undefined ? {} : { where: read.where }),
	})
}

async function create(context: Context, args: unknown): Promise<unknown> {
	const { resolved, adapter, model, caller } = context
	const found = given(args, model.name, ['data', 'select', 'include'], ['data'])
	const { read, shape } = plan(
		resolved.models,
		model,
		picked(found),
		'',
		'one',
		new Set(['select', 'include']),
	)
	const { id, plan: changes } = await createPlan(
		resolved.models,
		model,
		found.get('data'),
		caller,
		adapter,
	)
	if (!isMaster(caller)) {
		throw new PublicError('ACCESS_DENIED', `Cannot create ${model.name}.`, {
			details: { model: model.name, operation: 'create' },
		})
	}
	await changes.check(adapter)
	const rows = await write(adapter, (store) =>
		store.write({
			changes: changes.changes,
			read: { model: model.name, ...read, where: byId(id) },
		}),
	)
	return first(rows, shape)
}

/** The stored row a single-row write targets, `NOT_FOUND` when unseen. */
async function target(
	context: Context,
	found: ReadonlyMap<string, unknown>,
): Promise<Row | undefined> {
	const { resolved, adapter, model } = context
	const where = uniqueWhere(resolved.models, model, found.get('where'), 'where')
	const [row] = await adapter.find({ model: model.name, where, take: 1 })
	return row
}

function notFound(model: string): PublicError {
	return new PublicError('NOT_FOUND', `No ${model} matches.`)
}

async function update(context: Context, args: unknown): Promise<unknown> {
	const { resolved, adapter, model, caller } = context
	const found = given(
		args,
		model.name,
		['where', 'data', 'select', 'include'],
		['where', 'data'],
	)
	const { read, shape } = plan(
		resolved.models,
		model,
		picked(found),
		'',
		'one',
		new Set(['select', 'include']),
	)
	const row = await target(context, found)
	// The data is checked whether or not the row is found.
	const changes = await updatePlan(
		resolved.models,
		model,
		row?.id ?? '',
		found.get('data'),
		adapter,
	)
	if (row === undefined || !isMaster(caller)) throw notFound(model.name)
	await changes.check(adapter)
	const rows = await write(adapter, (store) =>
		store.write({
			changes: changes.changes,
			read: { model: model.name, ...read, where: byId(row.id) },
		}),
	)
	return first(rows, shape)
}

async function remove(context: Context, args: unknown): Promise<unknown> {
	const { resolved, adapter, model, caller } = context
	const found = given(args, model.name, ['where'], ['where'])
	const { shape } = plan(
		resolved.models,
		model,
		undefined,
		'',
		'one',
		new Set(),
	)
	const row = await target(context, found)
	if (row === undefined || !isMaster(caller)) throw notFound(model.name)
	await write(adapter, (store) =>
		store.write({
			changes: [{ kind: 'delete', model: model.name, where: byId(row.id) }],
		}),
	)
	return project(row, shape)
}

const operations: {
	readonly [O in Operation]: (
		context: Context,
		args: unknown,
	) => Promise<unknown>
} = {
	findMany: async (context, args) => find(context, args, false),
	findFirst: async (context, args) => find(context, args, true),
	findUnique,
	count,
	create,
	update,
	delete: remove,
}

/** Runs one query of a model of the running application. */
export async function query(
	name: string,
	operation: Operation,
	args: unknown,
	options: unknown,
): Promise<unknown> {
	const model = running?.resolved.models.get(name)
	if (running === undefined || model === undefined) {
		throw new Error(`${name} is not a model of a started application.`)
	}
	const context: Context = {
		...running,
		model,
		caller: callerOf(options, name),
	}
	return operations[operation](context, args)
}
