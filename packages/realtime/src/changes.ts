// One flush's changes (D-154), by model: the rows each kind of write reached
// and the fields updates set. A list the feed left out is `'all'`, every row
// or every field. A link or an unlink reads as an update of both sides,
// under each side's relation, as a `one` key's change already does.
import type { Changed, Schema } from 'ultimabase'

/** Some rows by id, or every row when the feed did not list them. */
export type Rows = ReadonlySet<string> | 'all'
/** Some fields by name, or every field. */
export type Fields = ReadonlySet<string> | 'all'

export interface ModelChanges {
	readonly inserts?: Rows
	readonly updates?: Rows
	readonly deletes?: Rows
	/** The fields its updates set. */
	readonly fields?: Fields
	/** The stored `one` keys each deleted row held, by id (D-196). */
	readonly keys?: ReadonlyMap<string, Readonly<Record<string, string | null>>>
}

export type Batch = ReadonlyMap<string, ModelChanges>

type Building = {
	inserts?: Set<string> | 'all'
	updates?: Set<string> | 'all'
	deletes?: Set<string> | 'all'
	fields?: Set<string> | 'all'
	keys?: Map<string, Record<string, string | null>>
}

const merge = (
	into: Set<string> | 'all' | undefined,
	values: readonly string[] | undefined,
): Set<string> | 'all' => {
	if (into === 'all' || values === undefined) return 'all'
	const set = into ?? new Set<string>()
	for (const value of values) set.add(value)
	return set
}

/** `changes` by model; a link's sides are found in `schema`. */
export function batchOf(changes: readonly Changed[], schema: Schema): Batch {
	const batch = new Map<string, Building>()
	const of = (model: string): Building => {
		const known = batch.get(model)
		if (known !== undefined) return known
		const created: Building = {}
		batch.set(model, created)
		return created
	}
	const updated = (
		model: string,
		ids: readonly string[] | undefined,
		fields: readonly string[] | undefined,
	): void => {
		const building = of(model)
		building.updates = merge(building.updates, ids)
		building.fields = merge(building.fields, fields)
	}
	for (const change of changes) {
		if (change.kind === 'link' || change.kind === 'unlink') {
			const field = schema.models
				.find(({ name }) => name === change.model)
				?.fields.find(({ name }) => name === change.field)
			const pairs = change.pairs
			updated(
				change.model,
				pairs?.map(([id]) => id),
				[change.field],
			)
			if (field?.kind === 'many') {
				updated(
					field.target,
					pairs?.map(([, id]) => id),
					[field.inverse],
				)
			}
		} else if (change.kind === 'update') {
			updated(change.model, change.ids, change.fields)
		} else if (change.kind === 'insert') {
			const building = of(change.model)
			building.inserts = merge(building.inserts, change.ids)
		} else if (change.kind === 'delete') {
			const building = of(change.model)
			building.deletes = merge(building.deletes, change.ids)
			const keys = (building.keys ??= new Map())
			for (const [at, id] of (change.ids ?? []).entries()) {
				const held = Object.entries(change.keys ?? {}).map(
					([field, values]) => [field, values[at] ?? null] as const,
				)
				keys.set(id, Object.fromEntries(held))
			}
		}
	}
	return batch
}

/** Whether `changes` updated one of `fields`. */
export function touched(
	changes: ModelChanges | undefined,
	fields: Fields,
): boolean {
	const set = changes?.fields
	if (changes?.updates === undefined || set === undefined) return false
	if (set === 'all' || fields === 'all') return true
	for (const field of set) if (fields.has(field)) return true
	return false
}

/** Whether `batch` wrote a row of one of `models`. */
export function wrote(batch: Batch, models: ReadonlySet<string>): boolean {
	for (const model of batch.keys()) if (models.has(model)) return true
	return false
}

/** Whether a list of `changes` is unknown. */
export const unlisted = (changes: ModelChanges | undefined): boolean =>
	changes?.inserts === 'all' ||
	changes?.updates === 'all' ||
	changes?.deletes === 'all'

/** The ids of `rows`, none when they are every row. */
export const listed = (rows: Rows | undefined): readonly string[] =>
	rows === undefined || rows === 'all' ? [] : [...rows]
