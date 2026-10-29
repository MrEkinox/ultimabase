// The queries a model sends to the running application (D-18): each one
// checked, run on the adapter, in the open transaction if any (D-36), and
// returned in the shape it asked for.
import { accessFor, and } from './access.ts'
import { InvalidQuery, PublicError } from './errors.ts'
import type { Identity } from './rules.ts'
import { isMaster } from './rules.ts'
import type { Read, Row } from './adapter.ts'
import type { Running } from './running.ts'
import { current } from './running.ts'
import type { ModelInfo } from './schema.ts'
import type { Context } from './query-context.ts'
import { filtered, first, given, picked, shapedRows } from './query-context.ts'
import { oneKeys, plan, restrict, uniqueWhere } from './query-args.ts'
import { counted } from './virtual-read.ts'
import { entries, isObject, unknownKey } from './query-where.ts'
import { QueryScope, planned } from './scope.ts'
import type { Commit, Store } from './transaction.ts'
import { reading, writing } from './transaction.ts'
import { aggregate } from './aggregate.ts'
import { distinctOf, groupBy } from './group-by.ts'
import { removeMany } from './delete-many.ts'
import { updateMany, updateManyAndReturn } from './update-many.ts'
import { createMany, createManyAndReturn } from './create-many.ts'
import { create, remove, update, upsert } from './writes.ts'

export type Operation =
	| 'findMany'
	| 'findFirst'
	| 'findUnique'
	| 'findFirstOrThrow'
	| 'findUniqueOrThrow'
	| 'count'
	| 'aggregate'
	| 'groupBy'
	| 'create'
	| 'update'
	| 'upsert'
	| 'delete'
	| 'updateMany'
	| 'createMany'
	| 'updateManyAndReturn'
	| 'createManyAndReturn'
	| 'deleteMany'
	// The transports' upsert, which also says whether it created (D-142).
	| 'upserted'

const anonymous: Identity = Object.freeze({ kind: 'anonymous' })

/**
 * `{ as }` only; without it, the caller is anonymous (D-19). The kernel
 * completes a user one (D-121).
 */
export function callerOf(options: unknown, model: string): Identity {
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
			return caller as Identity
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

const manyKeys = new Set([
	'where',
	...oneKeys,
	'orderBy',
	'take',
	'skip',
	'cursor',
])
const distinctKeys = new Set([...manyKeys, 'distinct'])

/** Finds a read's root rows, decoded; a live read may serve them (D-154). */
export type RootFind = (store: Store, read: Read) => Promise<Row[]>

const onStore: RootFind = async (store, read) => store.find(read)

async function find(
	context: Context,
	store: Store,
	args: unknown,
	single: boolean,
	root = onStore,
): Promise<unknown> {
	const { models, model, scope } = context
	const keys = single ? manyKeys : distinctKeys
	const { read, shape, readable } = await planned(scope, () => ({
		...plan(models, model, args, '', 'many', keys, scope),
		readable: scope.readable(model.name),
	}))
	const take = read.take ?? 1
	const limited = single ? { ...read, take: Math.sign(take) } : read
	const distinct = single ? undefined : await distinctOf(context, args)
	const rows = await root(store, {
		model: model.name,
		...restrict(limited, readable),
		...(distinct && { distinct }),
	})
	if (single) return first(context, store, rows, shape, scope.access)
	return shapedRows(context, store, rows, shape, scope.access)
}

async function findUnique(
	context: Context,
	store: Store,
	args: unknown,
): Promise<unknown> {
	const { models, model, scope } = context
	const found = given(args, model.name, ['where', ...oneKeys], ['where'])
	const { read, shape, where } = await planned(scope, () => ({
		...plan(models, model, picked(found), '', 'one', oneKeys, scope),
		where: and(
			uniqueWhere(models, model, found.get('where'), 'where', scope),
			scope.readable(model.name),
		),
	}))
	const rows = await store.find({ model: model.name, ...read, where })
	return first(context, store, rows, shape, scope.access)
}

async function count(
	context: Context,
	store: Store,
	args: unknown,
): Promise<number> {
	const { model } = context
	const where = await filtered(
		context,
		given(args, model.name, ['where'], []),
		'read',
	)
	return store.count({ model: model.name, ...(where && { where }) })
}

type Run = (context: Context, store: Store, args: unknown) => Promise<unknown>
type Write = (
	context: Context,
	store: Store,
	commits: Commit[],
	args: unknown,
) => Promise<unknown>

type ReadOperation =
	| 'findMany'
	| 'findFirst'
	| 'findUnique'
	| 'findFirstOrThrow'
	| 'findUniqueOrThrow'
	| 'count'
	| 'aggregate'
	| 'groupBy'

/** The read, which fails with `NOT_FOUND` rather than return `null` (D-135). */
const orThrow =
	(read: Run): Run =>
	async (context, store, args) => {
		const row = await read(context, store, args)
		if (row !== null) return row
		throw new PublicError('NOT_FOUND', `No ${context.model.name} matches.`)
	}

const reads: { readonly [O in ReadOperation]: Run } = {
	findMany: async (context, store, args) => find(context, store, args, false),
	findFirst: async (context, store, args) => find(context, store, args, true),
	findUnique,
	findFirstOrThrow: orThrow(async (context, store, args) =>
		find(context, store, args, true),
	),
	findUniqueOrThrow: orThrow(findUnique),
	count,
	aggregate,
	groupBy,
}

const writes: { readonly [O in Exclude<Operation, ReadOperation>]: Write } = {
	create,
	update,
	upsert: async (context, store, commits, args) =>
		(await upsert(context, store, commits, args)).row,
	upserted: upsert,
	delete: remove,
	updateMany,
	createMany,
	updateManyAndReturn,
	createManyAndReturn,
	deleteMany: removeMany,
}

function isRead(operation: Operation): operation is ReadOperation {
	return Object.hasOwn(reads, operation)
}

/** The running application and its model `name`. */
function runningModel(name: string): {
	readonly app: Running
	readonly model: ModelInfo
} {
	const app = current()
	const model = app?.resolved.models.get(name)
	if (app === undefined || model === undefined) {
		throw new Error(`${name} is not a model of a started application.`)
	}
	return { app, model }
}

async function contextOf(
	app: Running,
	model: ModelInfo,
	identity: Identity,
): Promise<Context> {
	const caller = await app.complete(identity)
	const { models } = app.resolved
	const access = accessFor(models, caller, app.logger)
	const scope = new QueryScope(models, caller, access)
	return { app, models, model, caller, scope }
}

/** Runs one query of a model of the running application. */
export async function query(
	name: string,
	operation: Operation,
	args: unknown,
	options: unknown,
): Promise<unknown> {
	const { app, model } = runningModel(name)
	const identity = callerOf(options, name)
	counted()
	return app.work.run(async () => {
		const context = await contextOf(app, model, identity)
		if (isRead(operation)) {
			const read = reads[operation]
			return reading(app, async (store) => read(context, store, args))
		}
		const write = writes[operation]
		return writing(app, async (store, commits) =>
			write(context, store, commits, args),
		)
	})
}

/** `findMany(args)` as `options` says, its root rows found by `root` (D-154). */
export async function rootFind(
	name: string,
	args: unknown,
	options: unknown,
	root: RootFind,
): Promise<unknown> {
	const { app, model } = runningModel(name)
	const identity = callerOf(options, name)
	return app.work.run(async () => {
		const context = await contextOf(app, model, identity)
		return reading(app, async (store) =>
			find(context, store, args, false, root),
		)
	})
}
