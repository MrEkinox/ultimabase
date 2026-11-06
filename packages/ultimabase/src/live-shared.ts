// What the live reads of one flush share (D-262): a relation's rule that only
// repeats its parent's says nothing more, so the read stops naming its viewer,
// and the viewers who ask the same read it in one statement.
import type { Filter, Nested, Row } from './adapter.ts'
import { isFilters } from './memory-conditions.ts'
import type { Models } from './query-where.ts'
import type { ModelInfo } from './schema.ts'

/** Each condition `filter` requires of a row. */
export const required = (filter: Filter): readonly Filter[] =>
	Object.entries(filter).flatMap(([key, value]): readonly Filter[] => {
		if (value === undefined) return []
		return key === 'AND' && isFilters(value)
			? value.flatMap(required)
			: [{ [key]: value }]
	})

/** The rows one statement reads, past those a viewer asks: enough for a flush. */
const statement = 1000

/** Whether `part` asks of `back`, the row's parent, only what `rule` holds of it. */
function repeats(
	part: Filter,
	back: string,
	rule: ReadonlySet<string>,
): boolean {
	const value = part[back]
	if (value === undefined || isFilters(value)) return false
	const { is: parent, ...others } = value
	if (parent === undefined || parent === null || Object.keys(others).length > 0)
		return false
	return required(parent).every((each) => rule.has(JSON.stringify(each)))
}

/** `read` without the relation rules its parents' rules already answer. */
export function spared<T extends Nested>(
	models: Models,
	model: ModelInfo,
	read: T,
	rule: Filter | undefined,
): T {
	const { include } = read
	if (include === undefined) return read
	const rules = new Set(
		required(rule ?? {}).map((each) => JSON.stringify(each)),
	)
	const kept: Record<string, Nested> = {}
	for (const [name, nested] of Object.entries(include)) {
		const field = model.fields.get(name)
		const target =
			field === undefined || field.kind === 'scalar'
				? undefined
				: models.get(field.target)
		kept[name] =
			field === undefined || field.kind === 'scalar' || target === undefined
				? nested
				: spare(models, target, nested, field.inverse, rules)
	}
	return { ...read, include: kept }
}

function spare(
	models: Models,
	target: ModelInfo,
	nested: Nested,
	inverse: string | undefined,
	rules: ReadonlySet<string>,
): Nested {
	const { where, ...rest } = spared(models, target, nested, nested.where)
	if (where === undefined) return rest
	const back = inverse === undefined ? undefined : target.fields.get(inverse)
	if (inverse === undefined || back?.kind !== 'one' || !back.stored) {
		return { ...rest, where }
	}
	const left = required(where).filter((part) => !repeats(part, inverse, rules))
	const [only, second] = left
	if (only === undefined) return rest
	return { ...rest, where: second === undefined ? only : { AND: left } }
}

/** Whether `read` shows the same rows to anyone, however it was planned. */
export function namesNobody(read: Nested): boolean {
	if (read.count !== undefined) return false
	return Object.values(read.include ?? {}).every(
		(nested) => nested.where === undefined && namesNobody(nested),
	)
}

/** One statement's rows, by id. */
type Reading = Promise<ReadonlyMap<string, Row>>

/** The reads of one flush, for the live reads that ask the same. */
export class SharedReads {
	readonly #expected = new Map<string, Set<string>>()
	readonly #reads = new Map<string, Map<string, Reading>>()

	/** A flush will likely ask for `ids`, rows of `model`. */
	expect(model: string, ids: Iterable<string>): void {
		const expected = this.#expected.get(model) ?? new Set()
		for (const id of ids) expected.add(id)
		this.#expected.set(model, expected)
	}

	/**
	 * The rows of `ids` that `read` finds, read once for each `key`; with
	 * `together`, the rows the flush expects come along.
	 */
	async rows(
		key: string,
		model: string,
		ids: readonly string[],
		together: boolean,
		read: (ids: readonly string[]) => Promise<readonly Row[]>,
	): Promise<readonly Row[]> {
		const known = this.#reads.get(key) ?? new Map<string, Reading>()
		this.#reads.set(key, known)
		const missing = new Set(ids.filter((id) => !known.has(id)))
		if (missing.size > 0) {
			for (const id of together ? (this.#expected.get(model) ?? []) : []) {
				if (missing.size >= statement) break
				if (!known.has(id)) missing.add(id)
			}
			const found = read([...missing]).then(
				(rows) => new Map(rows.map((row) => [row.id, row])),
			)
			for (const id of missing) known.set(id, found)
		}
		const rows: Row[] = []
		for (const id of ids) {
			const row = (await known.get(id))?.get(id)
			if (row !== undefined) rows.push(row)
		}
		return rows
	}
}
