// A `many`'s `size` (D-242): each parent a transaction touches holds `min`
// to `max` rows at its end. The writes are seen as the adapter gets them, so
// every path counts: nested writes, bulk writes, cascades and `setNull`.
import type { Change, Filter, Transaction, Write } from './adapter.ts'
import { PublicError, Refused } from './errors.ts'
import type { FieldOptions } from './definition.ts'
import { isObject } from './query-where.ts'
import type { FieldInfo, ModelInfo } from './schema.ts'

export type Size = {
	readonly min: number
	readonly max: number | undefined
}

/** A bounded `many`: `parent.field` holds the `child` rows whose `key` is it. */
type Bound = Size & {
	readonly parent: string
	readonly field: string
	readonly child: string
	readonly key: string
}

type Bounds = {
	readonly byParent: ReadonlyMap<string, readonly Bound[]>
	readonly byChild: ReadonlyMap<string, readonly Bound[]>
}

/** The parents a transaction touched, for each bound. */
export type Touched = Map<Bound, Set<string>>

const whole = (value: unknown, from: number): value is number =>
	Number.isInteger(value) && Number(value) >= from

/**
 * A `many`'s `size`, or `undefined` when it bounds nothing; stops startup on a size a many-to-many
 * or a view has, or on bounds that are not whole numbers in order.
 */
export function sizeOf(
	where: string,
	options: FieldOptions,
	join: boolean,
): Size | undefined {
	const size = options['size']
	if (size === undefined) return undefined
	if (join || options['from'] !== undefined) {
		throw new Refused(`${where}: size bounds a one-to-many relation only.`)
	}
	return boundsFrom(where, size)
}

/**
 * A list's `size`, or `undefined` when it bounds nothing (D-281); stops startup
 * on a size a field that is no list has, or on bounds as a `many`'s.
 */
export function listSizeOf(
	where: string,
	options: FieldOptions,
): Size | undefined {
	const size = options['size']
	if (size === undefined) return undefined
	if (options['list'] !== true) {
		throw new Refused(`${where}: size bounds a list only.`)
	}
	return boundsFrom(where, size)
}

function boundsFrom(where: string, size: unknown): Size | undefined {
	const { min = 0, max } = isObject(size) ? size : {}
	const ordered =
		isObject(size) &&
		Object.keys(size).every((key) => key === 'min' || key === 'max') &&
		whole(min, 0) &&
		(max === undefined || (whole(max, 1) && max >= min))
	if (!ordered) {
		throw new Refused(
			`${where}: size takes whole numbers, min from 0 and max from 1, as { min: 1, max: 10 }.`,
		)
	}
	// `{}` or `{ min: 0 }` bounds nothing.
	return min === 0 && max === undefined ? undefined : { min, max }
}

const cache = new WeakMap<ReadonlyMap<string, ModelInfo>, Bounds>()

function boundsOf(models: ReadonlyMap<string, ModelInfo>): Bounds {
	const known = cache.get(models)
	if (known !== undefined) return known
	const byParent = new Map<string, Bound[]>()
	const byChild = new Map<string, Bound[]>()
	for (const model of models.values()) {
		for (const field of model.fields.values()) {
			if (field.kind !== 'many') continue
			const at = `${model.name}.${field.name}`
			const size = sizeOf(at, field.options, field.join)
			if (size === undefined) continue
			const bound = {
				...size,
				parent: model.name,
				field: field.name,
				child: field.target,
				key: field.inverse,
			}
			byParent.set(model.name, [...(byParent.get(model.name) ?? []), bound])
			byChild.set(field.target, [...(byChild.get(field.target) ?? []), bound])
		}
	}
	const bounds = { byParent, byChild }
	cache.set(models, bounds)
	return bounds
}

/**
 * Whether a write adds rows to a bounded relation or takes rows from one: it
 * then needs a transaction (D-242).
 */
export function bounded(
	models: ReadonlyMap<string, ModelInfo>,
	write: Write,
): boolean {
	const { byParent, byChild } = boundsOf(models)
	return write.changes.some((change) => {
		const children = byChild.get(change.model) ?? []
		if (change.kind === 'insert') {
			return byParent.has(change.model) || children.length > 0
		}
		if (change.kind === 'update') {
			return children.some((bound) => Object.hasOwn(change.set, bound.key))
		}
		return change.kind === 'delete' && children.length > 0
	})
}

/** A row's stored key, as a change (an id) or a read (`{ id }`) holds it. */
const idOf = (key: unknown): string | undefined => {
	const id = isObject(key) ? key['id'] : key
	return typeof id === 'string' ? id : undefined
}

const isList = (value: Filter[string]): value is readonly Filter[] =>
	Array.isArray(value)

/**
 * The write's filters as they read before it runs: a key `removedBy` an
 * earlier delete of the write names one of the rows that delete removes.
 */
function before(tx: Transaction, write: Write) {
	const removed = new Map<number, Promise<string[]>>()
	const removedBy = async (at: number): Promise<string[]> => {
		const change = write.changes[at]
		if (change?.kind !== 'delete') throw new Error('No such delete.')
		const known = removed.get(at) ?? ids(change.model, change.where)
		removed.set(at, known)
		return known
	}
	const ids = async (model: string, where: Filter): Promise<string[]> => {
		const rows = await tx.find({ model, where: await read(where), fields: [] })
		return rows.map((row) => row.id)
	}
	const read = async (where: Filter): Promise<Filter> => {
		const resolved: { [key: string]: Filter[string] } = {}
		for (const [key, value] of Object.entries(where)) {
			resolved[key] = isList(value)
				? await Promise.all(value.map(read))
				: typeof value?.removedBy === 'number'
					? { is: { id: { in: await removedBy(value.removedBy) } } }
					: value
		}
		return resolved
	}
	return read
}

/** The parents one change takes rows from or adds rows to. */
async function parentsOf(
	bounds: Bounds,
	change: Change,
	read: (where: Filter) => Promise<Filter>,
	tx: Transaction,
): Promise<[Bound, string][]> {
	const { model } = change
	const children = bounds.byChild.get(model) ?? []
	if (change.kind === 'insert') {
		const { row } = change
		const own = bounds.byParent.get(model) ?? []
		return [
			...own.map((bound): [Bound, string] => [bound, row.id]),
			...keysOf(children, [row]),
		]
	}
	// A link changes a many-to-many, which takes no size.
	if (change.kind !== 'update' && change.kind !== 'delete') return []
	// An update moves rows when it sets their key, to its new parent.
	const added = change.kind === 'update' ? [change.set] : []
	const moved = children.filter((bound) =>
		added.every((set) => Object.hasOwn(set, bound.key)),
	)
	if (moved.length === 0) return []
	// The parents the rows leave, read before the write changes them.
	const rows = await tx.find({
		model,
		where: await read(change.where),
		fields: moved.map((bound) => bound.key),
		lock: change.kind,
	})
	return keysOf(moved, [...rows, ...added])
}

/** The parent each row's key names, for each bound. */
const keysOf = (
	bounds: readonly Bound[],
	rows: readonly { readonly [field: string]: unknown }[],
): [Bound, string][] =>
	rows.flatMap((row) =>
		bounds.flatMap((bound): [Bound, string][] => {
			const id = idOf(row[bound.key])
			return id === undefined ? [] : [[bound, id]]
		}),
	)

/**
 * Notes the parents `write` touches in `touched`, and locks the stored ones,
 * before the write runs: two writes to one parent run one after the other.
 */
export async function touch(
	models: ReadonlyMap<string, ModelInfo>,
	tx: Transaction,
	write: Write,
	touched: Touched,
): Promise<void> {
	const bounds = boundsOf(models)
	const read = before(tx, write)
	const added = new Map<string, Set<string>>()
	for (const change of write.changes) {
		for (const [bound, id] of await parentsOf(bounds, change, read, tx)) {
			const ids = touched.get(bound) ?? new Set()
			touched.set(bound, ids)
			if (ids.has(id)) continue
			ids.add(id)
			const locking = added.get(bound.parent) ?? new Set()
			added.set(bound.parent, locking.add(id))
		}
	}
	for (const [parent, ids] of added) {
		await tx.find({
			model: parent,
			where: { id: { in: [...ids] } },
			fields: ['id'],
			lock: 'update',
		})
	}
}

const counted = (count: number, noun: string): string =>
	count === 1 ? `1 ${noun}` : `${String(count)} ${noun}s`

const range = ({ min, max }: Size, noun: string): string =>
	max === undefined
		? `at least ${counted(min, noun)}`
		: min === 0
			? `at most ${counted(max, noun)}`
			: min === max
				? `exactly ${counted(max, noun)}`
				: `${String(min)} to ${counted(max, noun)}`

/** What a list outside its `size` is told, if it is (D-281). */
export function listIssue(
	size: Size | undefined,
	list: unknown,
): string | undefined {
	if (size === undefined || !Array.isArray(list)) return undefined
	const { min, max } = size
	return list.length >= min && (max === undefined || list.length <= max)
		? undefined
		: `Expected ${range(size, 'value')}.`
}

/** A bounded `many`'s or list's bound, which its description states (D-242). */
export function sizeNote(model: string, field: FieldInfo): string | undefined {
	if (field.kind === 'scalar') {
		return field.size && `Holds ${range(field.size, 'value')}.`
	}
	if (field.kind !== 'many') return undefined
	const size = sizeOf(`${model}.${field.name}`, field.options, field.join)
	return size === undefined ? undefined : `Holds ${range(size, 'row')}.`
}

/** Refuses the transaction when a touched parent left its bounds. */
export async function checkSizes(
	tx: Transaction,
	touched: Touched,
): Promise<void> {
	for (const [bound, ids] of touched) {
		const { parent, field, child, key, min, max } = bound
		const stored = await tx.find({
			model: parent,
			where: { id: { in: [...ids] } },
			fields: ['id'],
		})
		if (stored.length === 0) continue
		const groups = await tx.aggregate({
			model: child,
			where: { [key]: { is: { id: { in: stored.map((row) => row.id) } } } },
			aggregates: [{ operation: 'count' }],
			by: [{ field: key }],
		})
		const sizes = new Map(groups.map(([id, count]) => [id, Number(count)]))
		for (const { id } of stored) {
			const size = sizes.get(id) ?? 0
			if (size >= min && (max === undefined || size <= max)) continue
			throw new PublicError(
				'RELATION_SIZE',
				`${parent}.${field} holds ${range(bound, 'row')}: this write leaves ${String(size)}.`,
				{ details: { model: parent, field, id, min, max: max ?? null, size } },
			)
		}
	}
}
