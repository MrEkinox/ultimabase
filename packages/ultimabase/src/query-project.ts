// A row as a query returns it (D-149): the fields of its shape, its
// relations below, its virtuals as the read computed them (D-151), without
// the fields the caller's read rules hide (D-44).
import type { Shape } from './query-args.ts'
import type { ModelInfo } from './schema.ts'
import { isObject } from './query-where.ts'

/** The fields of a row its field read rules hide (D-44). */
export type Hidden = (
	model: ModelInfo,
	row: { readonly [field: string]: unknown },
	fields: Iterable<string>,
) => ReadonlySet<string>

/** The values of each row's virtuals, as a read computed them (D-151). */
export type Computed = WeakMap<object, Map<string, unknown>>

/** The virtuals of `shape` a field read rule hides, its own or a need's. */
export function unseenVirtuals(
	shape: Shape,
	row: { readonly [field: string]: unknown },
	hidden: Hidden | undefined,
): ReadonlySet<string> {
	const reads = [...shape.virtuals.values()].map(({ info }) => info)
	const names = reads.flatMap((info) => [info.name, ...info.needs])
	const unseen = hidden?.(shape.model, row, names)
	return new Set(
		reads
			.filter((info) => [info.name, ...info.needs].some((n) => unseen?.has(n)))
			.map((info) => info.name),
	)
}

/** A row as the query returns it, through the shape, without hidden fields. */
export function project(
	row: unknown,
	shape: Shape,
	hidden?: Hidden,
	computed?: Computed,
): unknown {
	if (Array.isArray(row)) {
		return row.map((item: unknown) => project(item, shape, hidden, computed))
	}
	if (!isObject(row)) return null
	const names = [...shape.fields, ...shape.relations.keys(), ...shape.counts]
	const unseen = hidden?.(shape.model, row, names)
	const result: { [field: string]: unknown } = {}
	for (const field of shape.fields) {
		if (!unseen?.has(field)) result[field] = row[field] ?? null
	}
	for (const [name, nested] of shape.relations) {
		if (!unseen?.has(name)) {
			result[name] = project(row[name], nested, hidden, computed)
		}
	}
	const values = computed?.get(row)
	const unseenVirtual =
		shape.virtuals.size > 0 ? unseenVirtuals(shape, row, hidden) : new Set()
	for (const name of shape.virtuals.keys()) {
		if (!unseenVirtual.has(name)) result[name] = values?.get(name) ?? null
	}
	if (shape.counts.length > 0) {
		const counts: { readonly [name: string]: unknown } = isObject(row['_count'])
			? row['_count']
			: {}
		result['_count'] = Object.fromEntries(
			shape.counts
				.filter((name) => !unseen?.has(name))
				.map((name) => [name, counts[name] ?? 0]),
		)
	}
	return result
}
