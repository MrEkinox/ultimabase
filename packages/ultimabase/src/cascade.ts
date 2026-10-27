// What a `delete` does to the rows that reference the row it deletes
// (D-54, D-90): `cascade` deletes them, `setNull` empties their key,
// `restrict` refuses the delete.
import type { Change, Filter, Row } from './adapter.ts'
import { PublicError } from './errors.ts'
import { hasHook, redirectOf } from './hooks.ts'
import type { Models } from './query-where.ts'
import type { ModelInfo } from './schema.ts'
import type { Checked, Reads } from './write-plan.ts'
import { updated } from './write-plan.ts'

/** A row the delete removes, or redirects (D-89). */
export type Doomed = {
	readonly model: ModelInfo
	readonly row: Row
	readonly redirected: boolean
}

/** Rows of `model` whose key `field` the delete empties. */
export type Nulled = {
	readonly model: ModelInfo
	readonly field: string
	readonly rows: readonly Row[]
}

export type Cascade = {
	/** The deepest first, the rows the caller deletes last. */
	readonly deleted: readonly Doomed[]
	readonly nulled: readonly Nulled[]
}

type Reference = { readonly model: ModelInfo; readonly field: string }

/** A row's key the cascade leaves: the write empties it itself (D-138). */
export type Except = {
	readonly model: string
	readonly field: string
	readonly id: string
}

/** The stored `one` relations to `target`, each with its `onDelete`. */
function referencesTo(
	models: Models,
	target: string,
): readonly (Reference & { readonly onDelete: string })[] {
	const references: (Reference & { readonly onDelete: string })[] = []
	for (const model of models.values()) {
		for (const field of model.fields.values()) {
			if (field.kind !== 'one' || !field.stored || field.target !== target) {
				continue
			}
			references.push({ model, field: field.name, onDelete: field.onDelete })
		}
	}
	return references
}

const keyOf = (model: ModelInfo, id: string): string => `${model.name}:${id}`

/**
 * Loads every row deleting `deleting` reaches, level by level, as stored: no
 * `beforeFind`, no access rules (D-54, D-90). Fails with
 * `RELATION_RESTRICTED` when a row the delete leaves references a deleted one.
 */
export async function cascadeOf(
	models: Models,
	model: ModelInfo,
	deleting: readonly Row[],
	store: Reads,
	except?: Except,
): Promise<Cascade> {
	const roots = deleting.map((row) => ({ model, row, redirected: false }))
	const deleted = new Map<string, Doomed>()
	for (const root of roots) deleted.set(keyOf(model, root.row.id), root)
	const restricted: (Reference & {
		readonly id: string
		readonly to: string
	})[] = []
	const nulled = new Map<string, Reference & { readonly rows: Row[] }>()
	let level: readonly Doomed[] = roots
	while (level.length > 0) {
		const next: Doomed[] = []
		const ids = new Map<ModelInfo, string[]>()
		for (const doomed of level) {
			ids.set(doomed.model, [...(ids.get(doomed.model) ?? []), doomed.row.id])
		}
		for (const [target, targets] of ids) {
			for (const reference of referencesTo(models, target.name)) {
				const { model: from, field, onDelete } = reference
				const rows = await store.find({
					model: from.name,
					where: { [field]: { is: { id: { in: targets } } } },
					lock: true,
				})
				for (const found of rows) {
					const left =
						except?.model === from.name &&
						except.field === field &&
						except.id === found.id
					if (left) continue
					if (onDelete === 'restrict') {
						restricted.push({
							model: from,
							field,
							id: found.id,
							to: target.name,
						})
					} else if (onDelete === 'setNull') {
						const key = `${from.name}.${field}`
						const group = nulled.get(key) ?? { model: from, field, rows: [] }
						// A key holds one target, deleted once: no row comes twice.
						group.rows.push(found)
						nulled.set(key, group)
					} else if (!deleted.has(keyOf(from, found.id))) {
						// Not redirected: a row that stayed would keep a key to a
						// deleted one (D-90).
						const doomed = { model: from, row: found, redirected: false }
						deleted.set(keyOf(from, found.id), doomed)
						next.push(doomed)
					}
				}
			}
		}
		level = next
	}
	// A row the cascade removes no longer references anything.
	const stays = (from: ModelInfo, id: string): boolean =>
		!deleted.has(keyOf(from, id))
	for (const { model: from, field, id, to } of restricted) {
		if (!stays(from, id)) continue
		throw new PublicError(
			'RELATION_RESTRICTED',
			`${from.name}.${field} references a ${to} the delete removes.`,
			{ details: { model: from.name, field } },
		)
	}
	return {
		// The roots last, in the order they were read.
		deleted: [...deleted.values()]
			.slice(roots.length)
			.toReversed()
			.concat(roots),
		nulled: [...nulled.values()].map((group) => ({
			...group,
			rows: group.rows.filter((found) => stays(group.model, found.id)),
		})),
	}
}

/** Whether deleting a row of `model` runs code of its own. */
const deleteRuns = (model: ModelInfo): boolean =>
	redirectOf(model) !== undefined ||
	hasHook(model, 'beforeDelete') ||
	hasHook(model, 'afterDelete') ||
	hasHook(model, 'afterDeleteCommit')

const anyOf = (filters: readonly Filter[]): Filter =>
	filters.length === 1 && filters[0] !== undefined
		? filters[0]
		: { OR: filters }

/**
 * The changes and checks of a delete whose reach runs no code, so no row is
 * loaded (D-102): the root goes by `where`, each level by the rows the level
 * above removed, and `setNull` empties the keys naming them. `undefined` when
 * a reached model has delete hooks or a redirect, a `setNull` one update
 * hooks, a cascade comes back to a model it left, or a model is both deleted
 * and emptied, or emptied twice.
 */
export function cascadeWhere(
	models: Models,
	model: ModelInfo,
	where: Filter,
): { readonly changes: Change[]; readonly checks: Checked[] } | undefined {
	/**
	 * Each deleted model's filters from the root, its longest path from the
	 * root, and the relations to the deleted models that reach it.
	 */
	type Level = {
		readonly filters: Filter[]
		depth: number
		readonly parents: Map<string, Reference>
	}
	const deleted = new Map<string, Level>()
	/** The rows each `setNull` or `restrict` relation reaches, by relation. */
	const reached = new Map<
		string,
		Reference & {
			readonly to: string
			readonly restricts: boolean
			readonly filters: Filter[]
		}
	>()
	const reach = (
		reference: Reference & { readonly to: string; readonly restricts: boolean },
		filter: Filter,
	): void => {
		const key = `${reference.model.name}.${reference.field}`
		const group = reached.get(key) ?? { ...reference, filters: [] }
		group.filters.push(filter)
		reached.set(key, group)
	}
	const visit = (
		at: ModelInfo,
		filter: Filter,
		path: string[],
		parent?: Reference,
	): boolean => {
		if (deleteRuns(at)) return false
		const entry: Level = deleted.get(at.name) ?? {
			filters: [],
			depth: 0,
			parents: new Map(),
		}
		entry.filters.push(filter)
		entry.depth = Math.max(entry.depth, path.length)
		if (parent !== undefined) {
			entry.parents.set(`${parent.model.name}.${parent.field}`, parent)
		}
		deleted.set(at.name, entry)
		const below = [...path, at.name]
		for (const { model: from, field, onDelete } of referencesTo(
			models,
			at.name,
		)) {
			const child = { [field]: { is: filter } }
			if (onDelete === 'cascade') {
				const edge = { model: at, field }
				if (below.includes(from.name) || !visit(from, child, below, edge)) {
					return false
				}
			} else if (onDelete === 'setNull' && updated(from)) {
				return false
			} else {
				const restricts = onDelete === 'restrict'
				reach({ model: from, field, to: at.name, restricts }, child)
			}
		}
		return true
	}
	if (!visit(model, where, [])) return undefined
	const groups = [...reached.values()]
	const nulls = groups.filter((group) => !group.restricts)
	const emptied = new Set(nulls.map((group) => group.model.name))
	// PostgreSQL gives two changes of the same rows in one statement no order.
	const twice =
		emptied.size < nulls.length ||
		[...emptied].some((name) => deleted.has(name))
	if (twice) return undefined
	// A row the cascade removes is not refusing.
	const left = (from: ModelInfo, filters: readonly Filter[]): Filter => {
		const gone = deleted.get(from.name)
		return gone === undefined
			? anyOf(filters)
			: { AND: [anyOf(filters), { NOT: [anyOf(gone.filters)] }] }
	}
	const checks = groups
		.filter((group) => group.restricts)
		.map((group) => ({
			check: {
				model: group.model.name,
				where: left(group.model, group.filters),
				count: 0,
			},
			message: `${group.model.name}.${group.field} references a ${group.to} the delete removes.`,
			restricted: { model: group.model.name, field: group.field },
		}))
	// A level after the levels above it: its parents have a lower depth.
	const levels = [...deleted].toSorted(([, a], [, b]) => a.depth - b.depth)
	const removedBy = (field: string, name: string): Filter => ({
		[field]: { removedBy: levels.findIndex(([each]) => each === name) },
	})
	const changes: Change[] = [
		...levels.map(([name, { parents }]) => ({
			kind: 'delete' as const,
			model: name,
			where:
				parents.size === 0
					? where
					: anyOf(
							[...parents.values()].map((edge) =>
								removedBy(edge.field, edge.model.name),
							),
						),
		})),
		...nulls.map((group) => ({
			kind: 'update' as const,
			model: group.model.name,
			where: removedBy(group.field, group.to),
			set: { [group.field]: null, updatedAt: new Date(Date.now()) },
		})),
	]
	return { changes, checks }
}
