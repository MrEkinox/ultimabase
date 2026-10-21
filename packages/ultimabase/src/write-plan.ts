// The steps of one write, before access rules and `beforeFind` turn them
// into the adapter's changes (D-71, D-78, D-86).
import { and, recordOf } from './access.ts'
import type { Change, Filter, Row } from './adapter.ts'
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

export type Step = Change | Move | Detach

/** What one write runs in: its store, its scope and the rows it changes. */
export type Writing = {
	readonly store: Store
	readonly scope: QueryScope
	readonly events: Event[]
	/** The changes a moved row's `beforeUpdate` added to its data. */
	readonly replan: (model: ModelInfo, id: string, draft: Draft) => Promise<Plan>
}

const byId = (id: string): Filter => ({ id: { equals: id } })
const byIds = (ids: readonly string[]): Filter => ({ id: { in: ids } })

function updated(model: ModelInfo): boolean {
	return (
		hasHook(model, 'beforeUpdate') ||
		hasHook(model, 'afterUpdate') ||
		hasHook(model, 'afterUpdateCommit')
	)
}

/** Each moved row's update hooks (D-88): the relation stays as asked. */
async function hooked(
	step: Move,
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
		const set = { [field]: to, updatedAt: new Date() }
		changes.push({ kind: 'update', model, where: byId(row.id), set })
		writing.events.push({
			model: target,
			operation: 'update',
			id: row.id,
			before: row,
		})
		if (Object.keys(data).length === 0) continue
		const plan = await writing.replan(target, row.id, data)
		await plan.check(writing)
		changes.push(...(await plan.changes(writing)))
	}
	return changes
}

/** The target rows a move changes, each allowed by the target's rules. */
async function move(step: Move, writing: Writing): Promise<Change[]> {
	const { model, field, via, where, to, trusted } = step
	const { scope, store } = writing
	const target = scope.models.get(model)
	if (target === undefined) throw new Error(`Unknown model ${model}.`)
	const filter = await scope.filter(model, trusted)
	const access = trusted ? undefined : scope.access
	const set = { [field]: to, updatedAt: new Date() }
	if (filter === undefined && access === undefined && !updated(target)) {
		return [{ kind: 'update', model, where, set }]
	}
	const rows = await store.find({ model, where: and(where, filter) })
	const data = {
		[field]: to === null ? { disconnect: true } : { connect: { id: to } },
	}
	for (const record of rows)
		access?.allow(target, 'update', { record, data, via })
	if (updated(target)) return hooked(step, target, rows, writing)
	if (rows.length === 0) return []
	const ids = rows.map((row) => row.id)
	return [{ kind: 'update', model, where: byIds(ids), set }]
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
					})
				).map((row) => row.id)
	if (kept.length === 0) return []
	return [{ ...link, kind: 'unlink', targets: kept }]
}

/** The steps of one write, and the ids its `connect`s need to exist. */
export class Plan {
	readonly steps: Step[] = []
	readonly issues: Issue[] = []
	private readonly connected = new Map<
		string,
		{ readonly model: string; readonly trusted: boolean; ids: Set<string> }
	>()

	connect(model: string, ids: readonly string[], trusted: boolean): void {
		const key = `${model}:${String(trusted)}`
		const group = this.connected.get(key) ?? { model, trusted, ids: new Set() }
		for (const id of ids) group.ids.add(id)
		this.connected.set(key, group)
	}

	/**
	 * Fails with the issues, then with `NOT_FOUND` for a target that is
	 * missing or that the write cannot reach (D-86).
	 */
	async check(writing: Writing): Promise<void> {
		if (this.issues.length > 0) throw invalid(this.issues)
		for (const { model, trusted, ids } of this.connected.values()) {
			if (ids.size === 0) continue
			const filter = await writing.scope.filter(model, trusted)
			const where = and(byIds([...ids]), filter)
			const found = await writing.store.count({ model, where })
			if (found !== ids.size) {
				throw new PublicError(
					'NOT_FOUND',
					`A connected ${model} does not exist.`,
				)
			}
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
			} else changes.push(step)
		}
		return changes
	}
}
