// The fixed hooks of D-15 at run time (D-71, D-88): the plugins', then the
// model's `.with` (D-89), run with their facts; `after*` hooks in the
// transaction, the `*Commit` hooks once it commits.
import { and, recordOf } from './access.ts'
import type { Filter, Row } from './adapter.ts'
import type { hookNames } from './plugin-code.ts'
import { commandOf, outsideCommands } from './plugin-code.ts'
import type { FindOperation } from './model.ts'
import type { Caller } from './rules.ts'
import type { Relations } from './relations.ts'
import { trusted } from './relations.ts'
import { filterOf, isReadFilter, readFilter } from './rules.ts'
import type { ModelInfo } from './schema.ts'
import type { Models } from './query-where.ts'
import { byIds, isObject, normalizeWhere } from './query-where.ts'
import { appLogger } from './running.ts'
import { hooks as traces, traced } from './traced.ts'
import type { Commit, Store } from './transaction.ts'
import { writesSoFar } from './transaction.ts'

type HookName = (typeof hookNames)[number]

type Hook = {
	/** Where it is written, for its errors. */
	readonly path: string
	readonly run: (facts: object) => Promise<unknown>
}

/** Runs a hook's body; the queries it makes run outside any command. */
async function called(hook: Function, facts: object): Promise<unknown> {
	return outsideCommands(async () => {
		const result: unknown = await Reflect.apply(hook, undefined, [facts])
		return result
	})
}

/** The application's hook `name` of the model, from its `.with` (D-71). */
function ownHook(model: ModelInfo, name: HookName): Hook | undefined {
	const rules = model.definition.rules
	const hooks =
		rules !== undefined && isObject(rules) ? rules['hooks'] : undefined
	if (hooks === undefined) return undefined
	if (!isObject(hooks)) {
		throw new TypeError(`${model.name}: hooks is an object.`)
	}
	const hook = hooks[name]
	if (hook === undefined) return undefined
	if (typeof hook !== 'function') {
		throw new TypeError(`${model.name}.hooks.${name} is a function.`)
	}
	const path = `${model.name}.hooks.${name}`
	const message = () => ({ model: model.name, hook: name, plugin: undefined })
	return {
		path,
		run: async (facts) =>
			traced(traces, message, () =>
				called(hook, { ...facts, logger: appLogger() }),
			),
	}
}

/**
 * The hooks `name` of the model: its plugins' first, in the order of
 * `plugins`, then the application's (D-29). A plugin's facts add what its
 * code gets of the model and the command running (D-89).
 */
function hooksOf(model: ModelInfo, name: HookName): readonly Hook[] {
	const hooks: Hook[] = []
	for (const use of model.plugins) {
		const hook = use.code.hooks[name]
		if (hook === undefined) continue
		const plugin = use.code.name
		const message = () => ({ model: model.name, hook: name, plugin })
		hooks.push({
			path: `${plugin}.hooks.${name} on ${model.name}`,
			run: async (facts) =>
				traced(traces, message, () =>
					called(hook, {
						...facts,
						...use.model,
						command: commandOf(model.name, plugin),
					}),
				),
		})
	}
	const own = ownHook(model, name)
	return own === undefined ? hooks : [...hooks, own]
}

export function hasHook(model: ModelInfo, name: HookName): boolean {
	return hooksOf(model, name).length > 0
}

export async function runHook(
	model: ModelInfo,
	name: 'beforeCreate' | 'beforeUpdate' | 'beforeDelete',
	facts: object,
): Promise<void> {
	for (const hook of hooksOf(model, name)) await hook.run(facts)
}

/** The filters every `beforeFind` ANDs into each read of the model (D-71). */
export async function beforeFind(
	models: Models,
	model: ModelInfo,
	caller: Caller,
	operation: FindOperation,
	relations: Relations,
): Promise<Filter | undefined> {
	let filter: Filter | undefined
	for (const hook of hooksOf(model, 'beforeFind')) {
		const result = await hook.run({ caller, operation, where: readFilter })
		if (result === undefined) continue
		if (!isReadFilter(result)) {
			throw new TypeError(`${hook.path} returns where({ ... }) or nothing.`)
		}
		// Trusted server code, as a read rule's filter (D-86, D-88); the one
		// filter of a plugin field (D-122).
		const where = normalizeWhere(
			models,
			model,
			filterOf(result),
			hook.path,
			trusted(relations),
			true,
		)
		filter = and(where, filter)
	}
	return filter
}

/**
 * The plugin's `redirect.delete`, which replaces the write of a `delete`,
 * given `where: { id }` of the row found (D-15, D-89).
 */
export function redirectOf(
	model: ModelInfo,
): ((caller: Caller, id: string) => Promise<unknown>) | undefined {
	const use = model.plugins.find((each) => each.code.redirect !== undefined)
	const redirect = use?.code.redirect
	if (use === undefined || redirect === undefined) return undefined
	return async (caller, id) => {
		const facts = { caller, where: { id }, ...use.model }
		const result: unknown = await Reflect.apply(redirect, undefined, [facts])
		return result
	}
}

/** A row a write changed, whose `after*` hooks run once it is written. */
export type Event =
	| {
			readonly model: ModelInfo
			readonly operation: 'create'
			readonly id: string
	  }
	| {
			readonly model: ModelInfo
			readonly operation: 'update' | 'delete'
			readonly id: string
			/** The stored row before the write. */
			readonly before: Row
	  }

const names = {
	create: ['afterCreate', 'afterCreateCommit'],
	update: ['afterUpdate', 'afterUpdateCommit'],
	delete: ['afterDelete', 'afterDeleteCommit'],
} as const

/** Whether an `after*` hook may change the rows, so the result is read again. */
export function rereads(events: readonly Event[]): boolean {
	return events.some((event) => hasHook(event.model, names[event.operation][0]))
}

/** Whether a hook follows the write, which then runs in a transaction. */
export function settles(events: readonly Event[]): boolean {
	return events.some((event) =>
		names[event.operation].some((name) => hasHook(event.model, name)),
	)
}

/** The row of an event, as written, `undefined` once deleted. */
type RowOf = (event: Event, at: number) => Promise<Row | undefined>

/** The most rows read at once for the `after*` hooks (D-329). */
const most = 1000

/**
 * The rows the hooks of `events` get, read a few at a time and twice as many
 * each time while no hook writes; after a write, which may change them, the
 * next row is read alone (D-329).
 */
function rowsOf(store: Store, events: readonly Event[]): RowOf {
	let model: ModelInfo | undefined
	let rows = new Map<string, Row | undefined>()
	let stamp: number | undefined
	let size = 1
	return async (event, at) => {
		const now = writesSoFar()
		const fresh = now !== undefined && now === stamp
		if (fresh && model === event.model && rows.has(event.id)) {
			return rows.get(event.id)
		}
		if (!fresh) size = 1
		const ids = new Set([event.id])
		for (const other of events.slice(at + 1, at + size)) {
			if (other.model === event.model && other.operation !== 'delete') {
				ids.add(other.id)
			}
		}
		// One shape of read: a row alone is read as it was before (D-329).
		const where =
			ids.size === 1 ? { id: { equals: event.id } } : byIds([...ids])
		const found = await store.find({
			model: event.model.name,
			where,
			take: ids.size,
		})
		model = event.model
		rows = new Map([...ids].map((id) => [id, undefined]))
		for (const row of found) rows.set(row.id, row)
		stamp = now
		size = Math.min(size * 2, most)
		return rows.get(event.id)
	}
}

/** A hook's facts; `row` is the event's row as written, unless it deletes. */
function factsOf(caller: Caller, event: Event, row: Row | undefined): object {
	const { model, id } = event
	if (event.operation === 'delete') {
		return { caller, record: recordOf(model, event.before) }
	}
	if (row === undefined) {
		throw new Error(`${model.name} ${id} was deleted before its after hooks.`)
	}
	const record = recordOf(model, row)
	if (event.operation === 'create') return { caller, record }
	return { caller, record, previous: recordOf(model, event.before) }
}

/**
 * Runs each event's `after*` hook in the transaction, and queues its
 * `*Commit` hook, with the same facts, for after the commit (D-15, D-71).
 */
export async function settle(
	store: Store,
	caller: Caller,
	events: readonly Event[],
	commits: Commit[],
): Promise<void> {
	const rowOf = rowsOf(store, events)
	for (const [at, event] of events.entries()) {
		const [now, later] = names[event.operation]
		const afters = hooksOf(event.model, now)
		const laters = hooksOf(event.model, later)
		if (afters.length === 0 && laters.length === 0) continue
		// As written, whatever `beforeFind` hides (D-88).
		const row =
			event.operation === 'delete' ? undefined : await rowOf(event, at)
		const facts = factsOf(caller, event, row)
		for (const hook of afters) await hook.run(facts)
		for (const hook of laters) {
			commits.push(async () => {
				await hook.run(facts)
			})
		}
	}
}
