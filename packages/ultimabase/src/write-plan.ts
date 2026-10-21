// The steps of one write, before access rules turn them into the adapter's
// changes (D-78, D-86).
import type { Access } from './access.ts'
import { and } from './access.ts'
import type { Change, Filter, Transaction } from './adapter.ts'
import { PublicError } from './errors.ts'
import type { Issue } from './errors.ts'

/** The reads a write needs before it runs. */
export type Reads = Pick<Transaction, 'find' | 'count'>

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
}

type Link = Extract<Change, { readonly kind: 'link' | 'unlink' }>

/** A join's `unlink`, kept to the `target` rows the caller reads (D-86). */
export type Detach = Omit<Link, 'kind'> & {
	readonly kind: 'detach'
	readonly target: string
}

export type Step = Change | Move | Detach

const byIds = (ids: readonly string[]): Filter => ({ id: { in: ids } })

/** The target rows a move changes, each allowed by the target's rules. */
async function move(
	step: Move,
	reads: Reads,
	access: Access | undefined,
): Promise<Change | undefined> {
	const { model, field, via, where, to } = step
	const set = { [field]: to }
	if (access === undefined) return { kind: 'update', model, where, set }
	const target = access.models.get(model)
	if (target === undefined) throw new Error(`Unknown model ${model}.`)
	const rows = await reads.find({
		model,
		where: and(where, access.readable(model)),
	})
	const data = {
		[field]: to === null ? { disconnect: true } : { connect: { id: to } },
	}
	for (const record of rows)
		access.allow(target, 'update', { record, data, via })
	if (rows.length === 0) return undefined
	return {
		kind: 'update',
		model,
		where: byIds(rows.map((row) => row.id)),
		set,
	}
}

/** A join's `unlink`, kept to the targets the caller reads. */
async function detach(
	step: Detach,
	reads: Reads,
	access: Access | undefined,
): Promise<Change | undefined> {
	const { target, targets, ...link } = step
	const kept =
		access === undefined
			? targets
			: (
					await reads.find({
						model: target,
						where: and(byIds(targets), access.readable(target)),
					})
				).map((row) => row.id)
	if (kept.length === 0) return undefined
	return { ...link, kind: 'unlink', targets: kept }
}

/** The steps of one write, and the ids its `connect`s need to exist. */
export class Plan {
	readonly steps: Step[] = []
	readonly issues: Issue[] = []
	private readonly connected = new Map<string, Set<string>>()

	connect(model: string, ids: readonly string[]): void {
		const set = this.connected.get(model) ?? new Set()
		for (const id of ids) set.add(id)
		this.connected.set(model, set)
	}

	/**
	 * Fails with the issues, then with `NOT_FOUND` for a target that is
	 * missing or that the caller cannot read (D-86).
	 */
	async check(reads: Reads, access: Access | undefined): Promise<void> {
		if (this.issues.length > 0) {
			throw new PublicError('VALIDATION_FAILED', 'Invalid data.', {
				details: { issues: this.issues },
			})
		}
		for (const [model, ids] of this.connected) {
			const where = and(byIds([...ids]), access?.readable(model))
			const found = await reads.count({ model, ...(where && { where }) })
			if (found !== ids.size) {
				throw new PublicError(
					'NOT_FOUND',
					`A connected ${model} does not exist.`,
				)
			}
		}
	}

	/**
	 * The adapter's changes. For a caller other than Master, a relation
	 * written from the other side runs the target's rules on each row it
	 * changes, and leaves the rows the caller cannot read (D-78, D-86).
	 */
	async changes(reads: Reads, access: Access | undefined): Promise<Change[]> {
		const changes: Change[] = []
		for (const step of this.steps) {
			const change =
				step.kind === 'move'
					? await move(step, reads, access)
					: step.kind === 'detach'
						? await detach(step, reads, access)
						: step
			if (change !== undefined) changes.push(change)
		}
		return changes
	}
}
