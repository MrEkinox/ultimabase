// The fixed hooks of D-15 at run time (D-71, D-88): read from the model's
// `.with`, run with their facts; `after*` hooks in the transaction, the
// `*Commit` hooks once it commits.
import { recordOf } from './access.ts'
import type { Filter, Row } from './adapter.ts'
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

type Hook = (facts: object) => Promise<unknown>

/** The model's hook `name`, `undefined` when it has none. */
function hookOf(model: ModelInfo, name: HookName): Hook | undefined {
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
	return async (facts) => {
		const result: unknown = await Reflect.apply(hook, undefined, [facts])
		return result
	}
}

export function hasHook(model: ModelInfo, name: HookName): boolean {
	return hookOf(model, name) !== undefined
}

export async function runHook(
	model: ModelInfo,
	name: 'beforeCreate' | 'beforeUpdate' | 'beforeDelete',
	facts: object,
): Promise<void> {
	await hookOf(model, name)?.(facts)
}

/** The filter `beforeFind` ANDs into every read of the model (D-71). */
export async function beforeFind(
	models: Models,
	model: ModelInfo,
	caller: Caller,
): Promise<Filter | undefined> {
	const hook = hookOf(model, 'beforeFind')
	const result = await hook?.({ caller, where: readFilter })
	if (result === undefined) return undefined
	if (!isReadFilter(result)) {
		throw new TypeError(
			`${model.name}.hooks.beforeFind returns where({ ... }) or nothing (D-71).`,
		)
	}
	// Trusted server code, as a read rule's filter (D-86, D-88).
	const path = `${model.name}.hooks.beforeFind`
	return normalizeWhere(models, model, filterOf(result), path)
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
		const after = hookOf(event.model, now)
		const commit = hookOf(event.model, later)
		if (after === undefined && commit === undefined) continue
		const facts = await factsOf(store, caller, event)
		await after?.(facts)
		if (commit !== undefined) {
			commits.push(async () => {
				await commit(facts)
			})
		}
	}
}
