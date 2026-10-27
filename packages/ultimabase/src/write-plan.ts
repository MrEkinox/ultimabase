// The steps of one write, before access rules and `beforeFind` turn them
// into the adapter's changes (D-71, D-78, D-86).
import { and, recordOf } from './access.ts'
import type { Change, Check, Filter, Row } from './adapter.ts'
import type { Except } from './cascade.ts'
import { PublicError } from './errors.ts'
import type { Issue } from './errors.ts'
import type { Event } from './hooks.ts'
import { hasHook, runHook } from './hooks.ts'
import type { ModelInfo } from './schema.ts'
import type { QueryScope } from './scope.ts'
import type { Store } from './transaction.ts'
import type { Draft } from './write-data.ts'
import { invalid } from './write-data.ts'

/** The reads a write needs before it runs. */
export type Reads = Pick<Store, 'find' | 'count'>

/**
 * A relation write from the other side: the target rows `where` selects
 * take `to` as their key `field`, under the target's rules (D-78).
 */
export type Move = {
	readonly kind: 'move'
	readonly model: string
	readonly field: string
	/** The relation written, as `Post.comments` (D-82). */
	readonly via: string
	readonly where: Filter
	readonly to: string | null
	/** A default's or a hook's value, which skips access rules (D-67). */
	readonly trusted: boolean
}

type Link = Extract<Change, { readonly kind: 'link' | 'unlink' }>

/** A join's `unlink`, kept to the `target` rows the caller reads (D-86). */
export type Detach = Omit<Link, 'kind'> & {
	readonly kind: 'detach'
	readonly target: string
	readonly trusted: boolean
}

/** A nested delete (D-138): its rows and their cascade, as `Target.delete`. */
export type Drop = {
	readonly kind: 'drop'
	readonly model: string
	readonly rows: readonly Row[]
	/** Where it sits in the write's data. */
	readonly path: string
	/** The key the parent empties itself, which the cascade leaves. */
	readonly except?: Except
	/** The rows the write updates, as `Model:id`: none may be deleted. */
	readonly written: ReadonlySet<string>
}

export type Step = Change | Move | Detach | Drop

/**
 * A check of the write, and what `NOT_FOUND` says when it fails (D-99), or
 * the relation a failed `RELATION_RESTRICTED` names (D-102).
 */
export type Checked = {
	readonly check: Check
	readonly message: string
	readonly restricted?: { readonly model: string; readonly field: string }
}

/**
 * What one write runs in: its store, its scope, the rows it changes and the
 * checks its changes need.
 */
export type Writing = {
	readonly store: Store
	readonly scope: QueryScope
	readonly events: Event[]
	readonly checks: Checked[]
	/** The changes a moved row's `beforeUpdate` added to its data. */
	readonly replan: (model: ModelInfo, id: string, draft: Draft) => Promise<Plan>
	/** A nested delete's changes, its cascade and hooks run (D-138). */
	readonly drop: (step: Drop) => Promise<Change[]>
}

const byId = (id: string): Filter => ({ id: { equals: id } })
const byIds = (ids: readonly string[]): Filter => ({ id: { in: ids } })

/** The shape of every id the kernel makes (D-22). */
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** Whether a model has update hooks, which need each row it updates. */
export function updated(model: ModelInfo): boolean {
	return (
		hasHook(model, 'beforeUpdate') ||
		hasHook(model, 'afterUpdate') ||
		hasHook(model, 'afterUpdateCommit')
	)
}

/** Each moved row's update hooks (D-88): the relation stays as asked. */
async function hooked(
	step: Pick<Move, 'model' | 'field' | 'to'>,
	target: ModelInfo,
	rows: readonly Row[],
	writing: Writing,
): Promise<Change[]> {
	const { model, field, to } = step
	const changes: Change[] = []
	for (const row of rows) {
		const data: Draft = {
			[field]: to === null ? { disconnect: true } : { connect: { id: to } },
		}
		await runHook(target, 'beforeUpdate', {
			caller: writing.scope.caller,
			record: recordOf(target, row),
			data,
		})
		Reflect.deleteProperty(data, field)
		const set = { [field]: to, updatedAt: new Date(Date.now()) }
		changes.push({ kind: 'update', model, where: byId(row.id), set })
		writing.events.push({
			model: target,
			operation: 'update',
			id: row.id,
			before: row,
		})
		if (Object.keys(data).length === 0) continue
		const plan = await writing.replan(target, row.id, data)
		writing.events.push(...plan.events)
		await plan.check(writing)
		changes.push(...(await plan.changes(writing)))
	}
	return changes
}

/**
 * The target rows a move changes, each allowed by the target's rules: it
 * updates them (D-124).
 */
async function move(step: Move, writing: Writing): Promise<Change[]> {
	const { model, field, via, where, to, trusted } = step
	const { scope, store } = writing
	const target = scope.models.get(model)
	if (target === undefined) throw new Error(`Unknown model ${model}.`)
	const filter = await scope.filter(model, trusted, 'update')
	const access = trusted ? undefined : scope.access
	const set = { [field]: to, updatedAt: new Date(Date.now()) }
	if (access === undefined && !updated(target)) {
		return [{ kind: 'update', model, where: and(where, filter), set }]
	}
	const rows = await store.find({
		model,
		where: and(where, filter),
		lock: true,
	})
	const data = {
		[field]: to === null ? { disconnect: true } : { connect: { id: to } },
	}
	for (const record of rows)
		access?.allow(target, 'update', { record, data, via })
	return moved(step, target, rows, writing)
}

/**
 * The changes giving `rows` of `target` the key `to`, through the target's
 * update hooks when it has some (D-88, D-90).
 */
export async function moved(
	step: Pick<Move, 'model' | 'field' | 'to'>,
	target: ModelInfo,
	rows: readonly Row[],
	writing: Writing,
): Promise<Change[]> {
	if (updated(target)) return hooked(step, target, rows, writing)
	if (rows.length === 0) return []
	const { model, field, to } = step
	const set = { [field]: to, updatedAt: new Date(Date.now()) }
	return [
		{ kind: 'update', model, where: byIds(rows.map((row) => row.id)), set },
	]
}

/** A join's `unlink`, kept to the targets the write reaches. */
async function detach(step: Detach, writing: Writing): Promise<Change[]> {
	const { target, targets, trusted, ...link } = step
	const filter = await writing.scope.filter(target, trusted)
	const kept =
		filter === undefined
			? targets
			: (
					await writing.store.find({
						model: target,
						where: and(byIds(targets), filter),
						lock: true,
					})
				).map((row) => row.id)
	if (kept.length === 0) return []
	return [{ ...link, kind: 'unlink', targets: kept }]
}

/** The steps of one write, and the ids its `connect`s need to exist. */
export class Plan {
	readonly steps: Step[] = []
	readonly issues: Issue[] = []
	/** The rows its nested `create`s make, their hooks run (D-128). */
	readonly events: Event[] = []
	/** The ids of the rows it creates, which a `connect` needs not find. */
	readonly made: Set<string> = new Set()
	/** The rows it updates, as `Model:id` (D-138). */
	readonly written: Set<string> = new Set()
	private readonly connected = new Map<
		string,
		{
			readonly model: string
			readonly trusted: boolean
			readonly operation: 'read' | 'update'
			ids: Set<string>
		}
	>()

	/** Connected ids, which a move updates and any other connect reads (D-124). */
	connect(
		model: string,
		ids: readonly string[],
		trusted: boolean,
		operation: 'read' | 'update',
	): void {
		const key = `${model}:${String(trusted)}:${operation}`
		const group = this.connected.get(key) ?? {
			model,
			trusted,
			operation,
			ids: new Set(),
		}
		for (const id of ids) group.ids.add(id)
		this.connected.set(key, group)
	}

	/**
	 * Fails with the issues, then adds the write's checks: a target that is
	 * missing or that the write cannot reach is `NOT_FOUND` (D-86, D-99).
	 */
	async check(writing: Writing): Promise<void> {
		if (this.issues.length > 0) throw invalid(this.issues)
		for (const group of this.connected.values()) {
			const { model, trusted, operation } = group
			const ids = new Set([...group.ids].filter((id) => !this.made.has(id)))
			if (ids.size === 0) continue
			const message = `A connected ${model} does not exist.`
			// No row has an id the kernel cannot have made.
			if (![...ids].every((id) => uuid.test(id))) {
				throw new PublicError('NOT_FOUND', message)
			}
			const filter = await writing.scope.filter(model, trusted, operation)
			const where = and(byIds([...ids]), filter)
			writing.checks.push({ check: { model, where, count: ids.size }, message })
		}
	}

	/**
	 * The adapter's changes. A relation written from the other side runs the
	 * target's rules and update hooks on each row it changes, and leaves the
	 * rows the write cannot reach (D-78, D-86, D-88).
	 */
	async changes(writing: Writing): Promise<Change[]> {
		const changes: Change[] = []
		for (const step of this.steps) {
			if (step.kind === 'move') changes.push(...(await move(step, writing)))
			else if (step.kind === 'detach') {
				changes.push(...(await detach(step, writing)))
			} else if (step.kind === 'drop') {
				changes.push(...(await writing.drop(step)))
			} else changes.push(step)
		}
		return changes
	}
}
