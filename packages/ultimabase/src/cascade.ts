// What a `delete` does to the rows that reference the row it deletes
// (D-54, D-90): `cascade` deletes them, `setNull` empties their key,
// `restrict` refuses the delete.
import type { Row } from './adapter.ts'
import { PublicError } from './errors.ts'
import { redirectOf } from './hooks.ts'
import type { Models } from './query-where.ts'
import type { ModelInfo } from './schema.ts'
import type { Reads } from './write-plan.ts'

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
	/** The deepest first, the row the caller deletes last. */
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
 * Loads every row deleting `row` reaches, level by level, as stored: no
 * `beforeFind`, no access rules (D-54, D-90). Fails with
 * `RELATION_RESTRICTED` when a row the delete leaves references a deleted one.
 */
export async function cascadeOf(
	models: Models,
	model: ModelInfo,
	row: Row,
	store: Reads,
): Promise<Cascade> {
	const deleted = new Map<string, Doomed>()
	deleted.set(keyOf(model, row.id), { model, row, redirected: false })
	const restricted: (Reference & {
		readonly id: string
		readonly to: string
	})[] = []
	const nulled = new Map<string, Reference & { readonly rows: Row[] }>()
	let level: readonly Doomed[] = [{ model, row, redirected: false }]
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
			`${from.name}.${field} references a ${to} the delete removes (D-54).`,
			{ details: { model: from.name, field } },
		)
	}
	return {
		deleted: [...deleted.values()].toReversed(),
		nulled: [...nulled.values()].map((group) => ({
			...group,
			rows: group.rows.filter((found) => stays(group.model, found.id)),
		})),
	}
}
