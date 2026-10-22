// The fixed hooks of D-15 at run time (D-71, D-88): the plugins', then the
// model's `.with` (D-89), run with their facts; `after*` hooks in the
// transaction, the `*Commit` hooks once it commits.
import { and, recordOf } from './access.ts'
import type { Filter, Row } from './adapter.ts'
import { commandOf, outsideCommands } from './plugin-code.ts'
import type { Caller } from './rules.ts'
import { filterOf, isReadFilter, readFilter } from './rules.ts'
import type { ModelInfo } from './schema.ts'
import type { Models } from './query-where.ts'
import { isObject, normalizeWhere } from './query-where.ts'
import type { Commit, Store } from './transaction.ts'

type HookName =
	| 'beforeFind'
	| 'beforeCreate'
	| 'beforeUpdate'
	| 'beforeDelete'
	| 'afterCreate'
	| 'afterUpdate'
	| 'afterDelete'
	| 'afterCreateCommit'
	| 'afterUpdateCommit'
	| 'afterDeleteCommit'

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
		throw new TypeError(`${model.name}: hooks is an object (D-71).`)
	}
	const hook = hooks[name]
	if (hook === undefined) return undefined
	if (typeof hook !== 'function') {
		throw new TypeError(`${model.name}.hooks.${name} is a function (D-71).`)
	}
	const path = `${model.name}.hooks.${name}`
	return { path, run: async (facts) => called(hook, facts) }
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
		hooks.push({
			path: `${plugin}.hooks.${name} on ${model.name}`,
			run: async (facts) =>
				called(hook, {
					...facts,
					...use.model,
					command: commandOf(model.name, plugin),
				}),
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
): Promise<Filter | undefined> {
	let filter: Filter | undefined
	for (const hook of hooksOf(model, 'beforeFind')) {
		const result = await hook.run({ caller, where: readFilter })
		if (result === undefined) continue
		if (!isReadFilter(result)) {
			throw new TypeError(
				`${hook.path} returns where({ ... }) or nothing (D-71).`,
			)
		}
		// Trusted server code, as a read rule's filter (D-86, D-88).
		const where = normalizeWhere(models, model, filterOf(result), hook.path)
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

async function factsOf(
	store: Store,
	caller: Caller,
	event: Event,
): Promise<object> {
	const { model, id } = event
	if (event.operation === 'delete') {
		return { caller, record: recordOf(model, event.before) }
	}
	// As written, whatever `beforeFind` hides (D-88).
	const [row] = await store.find({
		model: model.name,
		where: { id: { equals: id } },
		take: 1,
	})
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
	for (const event of events) {
		const [now, later] = names[event.operation]
		const afters = hooksOf(event.model, now)
		const laters = hooksOf(event.model, later)
		if (afters.length === 0 && laters.length === 0) continue
		const facts = await factsOf(store, caller, event)
		for (const hook of afters) await hook.run(facts)
		for (const hook of laters) {
			commits.push(async () => {
				await hook.run(facts)
			})
		}
	}
}
