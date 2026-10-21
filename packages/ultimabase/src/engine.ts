// The running application and the queries its models send (D-18): each one
// checked, run on the adapter and returned in the shape it asked for.
import type { Access } from './access.ts'
import { accessFor, and } from './access.ts'
import type { Adapter, Filter, Row } from './adapter.ts'
import { UniqueViolation } from './adapter.ts'
import { InvalidQuery, PublicError } from './errors.ts'
import type { Caller } from './rules.ts'
import { isMaster } from './rules.ts'
import type { ModelInfo, Resolved } from './schema.ts'
import type { Hidden, Shape } from './query-args.ts'
import { plan, project, restrict, uniqueWhere } from './query-args.ts'
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

/** The fields the caller's field read rules hide (D-44). */
function hiddenBy(access: Access | undefined): Hidden | undefined {
	return access && ((model, row, fields) => access.hidden(model, row, fields))
}

function first(
	rows: readonly Row[],
	shape: Shape,
	access: Access | undefined,
): unknown {
	const [row] = rows
	return row === undefined ? null : project(row, shape, hiddenBy(access))
}

/** `where`, kept to the rows the caller reads (D-10). */
function visible(context: Context, where: Filter): Filter {
	const readable = context.access?.readable(context.model.name)
	return readable === undefined ? where : { AND: [readable, where] }
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

async function find(
	context: Context,
	args: unknown,
	single: boolean,
): Promise<unknown> {
	const { resolved, adapter, model, access } = context
	const { read, shape } = plan(
		resolved.models,
		model,
		args,
		'',
		'many',
		new Set(manyKeys),
		access,
	)
	const take = read.take ?? 1
	const limited = single ? { ...read, take: Math.sign(take) } : read
	const rows = await adapter.find({
		model: model.name,
		...restrict(limited, access?.readable(model.name)),
	})
	if (single) return first(rows, shape, access)
	return rows.map((row) => project(row, shape, hiddenBy(access)))
}

/** A query's caller, and its access rules unless it is Master (D-48). */
type Context = Running & {
	readonly model: ModelInfo
	readonly caller: Caller
	readonly access: Access | undefined
}

async function findUnique(context: Context, args: unknown): Promise<unknown> {
	const { resolved, adapter, model, access } = context
	const found = given(
		args,
		model.name,
		['where', 'select', 'include'],
		['where'],
	)
	const unique = uniqueWhere(
		resolved.models,
		model,
		found.get('where'),
		'where',
		access,
	)
	const { read, shape } = plan(
		resolved.models,
		model,
		picked(found),
		'',
		'one',
		new Set(['select', 'include']),
		access,
	)
	const where = visible(context, unique)
	const rows = await adapter.find({ model: model.name, ...read, where })
	return first(rows, shape, access)
}

async function count(context: Context, args: unknown): Promise<number> {
	const { resolved, adapter, model, access } = context
	const found = given(args, model.name, ['where'], [])
	const { read } = plan(
		resolved.models,
		model,
		Object.fromEntries(found),
		'',
		'one',
		new Set(['where']),
		access,
	)
	const where = and(read.where, access?.readable(model.name))
	return adapter.count({ model: model.name, ...(where && { where }) })
}

/**
 * The model's rule and the fields' rules, then validation and the targets
 * a `connect` names, then the target-side rules of each relation (D-67).
 */
async function create(context: Context, args: unknown): Promise<unknown> {
	const { resolved, adapter, model, caller, access } = context
	const found = given(args, model.name, ['data', 'select', 'include'], ['data'])
	const { read, shape } = plan(
		resolved.models,
		model,
		picked(found),
		'',
		'one',
		new Set(['select', 'include']),
		access,
	)
	const data = found.get('data')
	const { id, plan: steps } = await createPlan(
		resolved.models,
		model,
		data,
		caller,
		adapter,
		access,
	)
	await steps.check(adapter, access)
	const changes = await steps.changes(adapter, access)
	// The created row comes back even when the read rule would hide it.
	const rows = await write(adapter, (store) =>
		store.write({
			changes,
			read: { model: model.name, ...read, where: byId(id) },
		}),
	)
	return first(rows, shape, access)
}

/** The stored row a single-row write targets, `NOT_FOUND` when unseen. */
async function target(
	context: Context,
	found: ReadonlyMap<string, unknown>,
): Promise<Row | undefined> {
	const { resolved, adapter, model, access } = context
	const unique = uniqueWhere(
		resolved.models,
		model,
		found.get('where'),
		'where',
		access,
	)
	const where = visible(context, unique)
	const [row] = await adapter.find({ model: model.name, where, take: 1 })
	return row
}

function notFound(model: string): PublicError {
	return new PublicError('NOT_FOUND', `No ${model} matches.`)
}

async function update(context: Context, args: unknown): Promise<unknown> {
	const { resolved, adapter, model, access } = context
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
		access,
	)
	const row = await target(context, found)
	const data = found.get('data')
	// The data is checked whether or not the row is found.
	const steps = await updatePlan(
		resolved.models,
		model,
		row?.id ?? '',
		data,
		adapter,
	)
	// A row the caller cannot read is not found (D-72).
	if (row === undefined) throw notFound(model.name)
	access?.allow(model, 'update', { record: row, data })
	await steps.check(adapter, access)
	const changes = await steps.changes(adapter, access)
	const rows = await write(adapter, (store) =>
		store.write({
			changes,
			read: { model: model.name, ...read, where: byId(row.id) },
		}),
	)
	return first(rows, shape, access)
}

async function remove(context: Context, args: unknown): Promise<unknown> {
	const { resolved, adapter, model, access } = context
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
	if (row === undefined) throw notFound(model.name)
	access?.allow(model, 'delete', { record: row })
	await write(adapter, (store) =>
		store.write({
			changes: [{ kind: 'delete', model: model.name, where: byId(row.id) }],
		}),
	)
	return project(row, shape, hiddenBy(access))
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
	const caller = callerOf(options, name)
	const access = accessFor(running.resolved.models, caller)
	const context: Context = { ...running, model, caller, access }
	return operations[operation](context, args)
}
