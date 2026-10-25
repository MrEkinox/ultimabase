// What a `delete` does to the rows that reference the row it deletes
// (D-54, D-90): `cascade` deletes them, `setNull` empties their key,
// `restrict` refuses the delete.
import type { Change, Condition, Filter, Row } from './adapter.ts'
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
						const redirected = redirectOf(from) !== undefined
						const doomed = { model: from, row: found, redirected }
						deleted.set(keyOf(from, found.id), doomed)
						// A redirected row stays: its children keep their key.
						if (!redirected) next.push(doomed)
					}
				}
			}
		}
		level = next
	}
	// A row the cascade removes no longer references anything.
	const stays = (from: ModelInfo, id: string): boolean =>
		deleted.get(keyOf(from, id))?.redirected !== false
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

type Filtered = Extract<Change, { readonly where: Filter }>

function named(models: Models, name: string): ModelInfo {
	const model = models.get(name)
	if (model === undefined) throw new Error(`Unknown model ${name}.`)
	return model
}

const isCondition = (value: Filter[string]): value is Condition =>
	value !== undefined && !Array.isArray(value)

/**
 * What a filter on `model` reads: `Model` for its rows, `Model.field` for a
 * value or a key.
 */
function readsOf(
	models: Models,
	model: ModelInfo,
	where: Filter,
	reads: Set<string>,
): Set<string> {
	reads.add(model.name)
	for (const each of [...(where.AND ?? []), ...(where.OR ?? [])]) {
		readsOf(models, model, each, reads)
	}
	for (const each of where.NOT ?? []) readsOf(models, model, each, reads)
	for (const [name, condition] of Object.entries(where)) {
		if (!isCondition(condition)) continue
		reads.add(`${model.name}.${name}`)
		const field = model.fields.get(name)
		if (field?.kind !== 'one' && field?.kind !== 'many') continue
		const target = named(models, field.target)
		reads.add(target.name).add(`${target.name}.${field.inverse}`)
		const { is, isNot, some, every, none } = condition
		for (const inner of [is, isNot, some, every, none]) {
			if (inner !== undefined && inner !== null) {
				readsOf(models, target, inner, reads)
			}
		}
	}
	return reads
}

/** Whether a change filters on what a change before it wrote. */
function overlaps(models: Models, changes: readonly Filtered[]): boolean {
	const written = new Set<string>()
	for (const change of changes) {
		const model = named(models, change.model)
		const reads = readsOf(models, model, change.where, new Set())
		if ([...reads].some((read) => written.has(read))) return true
		if (change.kind === 'delete') written.add(change.model)
		else {
			for (const field of Object.keys(change.set)) {
				written.add(`${change.model}.${field}`)
			}
		}
	}
	return false
}

/**
 * The changes and checks of a delete whose reach runs no code: each level is
 * a filter from the rows `where` selects, so no row is loaded (D-102).
 * `undefined` when a reached model has delete hooks or a redirect, a
 * `setNull` one update hooks, a cascade comes back to a model it left, or a
 * change filters on rows a change before it deleted or emptied.
 */
export function cascadeWhere(
	models: Models,
	model: ModelInfo,
	where: Filter,
): { readonly changes: Change[]; readonly checks: Checked[] } | undefined {
	/** Each deleted model's filters, and its longest path from the root. */
	const deleted = new Map<string, { filters: Filter[]; depth: number }>()
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
	const visit = (at: ModelInfo, filter: Filter, path: string[]): boolean => {
		if (deleteRuns(at)) return false
		const entry = deleted.get(at.name) ?? { filters: [], depth: 0 }
		entry.filters.push(filter)
		entry.depth = Math.max(entry.depth, path.length)
		deleted.set(at.name, entry)
		const below = [...path, at.name]
		for (const { model: from, field, onDelete } of referencesTo(
			models,
			at.name,
		)) {
			const child = { [field]: { is: filter } }
			if (onDelete === 'cascade') {
				if (below.includes(from.name) || !visit(from, child, below)) {
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
	// A row the cascade removes is neither emptied nor refusing.
	const left = (from: ModelInfo, filters: readonly Filter[]): Filter => {
		const gone = deleted.get(from.name)
		return gone === undefined
			? anyOf(filters)
			: { AND: [anyOf(filters), { NOT: [anyOf(gone.filters)] }] }
	}
	const groups = [...reached.values()]
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
	// Each change filters on the rows the changes after it remove.
	const changes: Filtered[] = [
		...groups
			.filter((group) => !group.restricts)
			.map((group) => ({
				kind: 'update' as const,
				model: group.model.name,
				where: left(group.model, group.filters),
				set: { [group.field]: null, updatedAt: new Date(Date.now()) },
			})),
		...[...deleted]
			.toSorted(([, a], [, b]) => b.depth - a.depth)
			.map(([name, { filters }]) => ({
				kind: 'delete' as const,
				model: name,
				where: anyOf(filters),
			})),
	]
	// Deleting a shop whose aisle matches deletes the aisle first (D-102).
	return overlaps(models, changes) ? undefined : { changes, checks }
}
