// The filters a write rule returns (D-214): each row a write changes
// matches its rule's filter, before an update or a delete in the write's own
// checks, after a create or an update once the write ran, in its
// transaction, unless the update changes none of the fields it reads
// (D-342).
import type { Write } from './access.ts'
import type { Change, Filter, Lock } from './adapter.ts'
import type { PublicError } from './errors.ts'
import type { Relations } from './relations.ts'
import { trusted } from './relations.ts'
import { partsOf, isReadFilter } from './rules.ts'
import type { ModelInfo } from './schema.ts'
import type { Models } from './query-where.ts'
import { byIds, normalizeWhere } from './query-where.ts'
import type { Store } from './transaction.ts'
import type { Checked } from './write-plan.ts'

/** A row the filter of its write rule must match. */
export type RowRule = {
	readonly model: string
	/** The row's id, or the filter of a row the write loads none of (D-342). */
	readonly id: string | Filter
	readonly where: Filter
	readonly before: boolean
	readonly after: boolean
	/** Alike rules are checked in one count. */
	readonly key: string
	readonly refuse: () => PublicError
}

/** The rules a write rule's `result` sets on the row it writes. */
export function rowRules(
	models: Models,
	relations: Relations,
	model: ModelInfo,
	write: Write,
	ruled: {
		readonly result: unknown
		readonly operation: 'create' | 'update' | 'delete'
		/** The refusal of a filter without its own error, logged (D-88). */
		readonly refuse: () => PublicError
	},
): RowRule[] {
	const { result, operation, refuse } = ruled
	if (!isReadFilter(result)) {
		throw new TypeError('A write rule returns a boolean or a filter.')
	}
	const stored = write.record?.['id']
	const id = typeof stored === 'string' ? stored : (write.id ?? write.by)
	if (id === undefined) throw new Error(`${model.name}: no id to check.`)
	const path = `${model.name}.access.${operation}`
	return partsOf(result).map(({ where, error }) => {
		// The rule's own filter is trusted, as a read rule's (D-86).
		const filter = normalizeWhere(
			models,
			model,
			where,
			path,
			trusted(relations),
		)
		const named = [operation, write.via, filter, error?.code, error?.message]
		return {
			model: model.name,
			id,
			where: filter,
			before: operation !== 'create',
			after: operation !== 'delete',
			key: JSON.stringify([model.name, ...named]),
			refuse: () => {
				const denied = refuse()
				return error ?? denied
			},
		}
	})
}

type Group = {
	readonly model: string
	readonly where: Filter
	readonly ids: Set<string>
	/** The row of a write that loads none, locked as its own check (D-342). */
	readonly by?: { readonly where: Filter; readonly lock: Lock }
	readonly refuse: () => PublicError
}

function grouped(
	rules: readonly RowRule[],
	when: 'before' | 'after',
): readonly Group[] {
	const groups = new Map<string, Group>()
	for (const rule of rules) {
		if (!rule[when]) continue
		const { id } = rule
		if (typeof id !== 'string') {
			const lock = rule.after ? 'update' : 'delete'
			const by = { where: id, lock } as const
			groups.set(`${rule.key}${JSON.stringify(id)}`, {
				...rule,
				ids: new Set(),
				by,
			})
			continue
		}
		const group = groups.get(rule.key) ?? { ...rule, ids: new Set() }
		group.ids.add(id)
		groups.set(rule.key, group)
	}
	return [...groups.values()]
}

const counted = ({ model, where, ids, by }: Group) =>
	by === undefined
		? { model, where: { AND: [byIds([...ids]), where] }, count: ids.size }
		: { model, where: { AND: [by.where, where] }, count: 1, lock: by.lock }

/** The fields of its model a filter reads, through `AND`, `OR` and `NOT`. */
function fieldsOf(filter: Filter, into = new Set<string>()): Set<string> {
	const { AND = [], OR = [], NOT = [], ...fields } = filter
	for (const each of [...AND, ...OR, ...NOT]) fieldsOf(each, into)
	for (const field of Object.keys(fields)) into.add(field)
	return into
}

/**
 * Whether the write is one update of the group's model that sets none of
 * the fields its filter reads: the rows matched it before, so they still
 * do (D-342).
 */
function keeps(group: Group, changes: readonly Change[]): boolean {
	const [change, ...others] = changes
	if (change?.kind !== 'update' || others.length > 0) return false
	if (change.model !== group.model) return false
	const read = fieldsOf(group.where)
	// A search reads the searched fields, which its key does not name.
	if (read.has('_search')) return false
	const set = [...Object.keys(change.set), ...Object.keys(change.compute ?? {})]
	return set.every((field) => !read.has(field))
}

/** The checks of the filters a write's rules returned. */
export type RowChecks = {
	/** Run first, in the write's statement. */
	readonly before: readonly Checked[]
	/** Whether a check follows the write, which then runs in a transaction. */
	readonly after: boolean
	/** Counts the rows, `before` the write when no statement holds its checks. */
	readonly verify: (
		store: Pick<Store, 'count'>,
		when?: 'before' | 'after',
	) => Promise<void>
}

/** The checks of the filters the write rules returned since the last ones. */
export function rowChecks(
	access: { readonly rowRules: () => RowRule[] } | undefined,
	changes: readonly Change[] = [],
): RowChecks {
	const rules = access?.rowRules() ?? []
	const before = grouped(rules, 'before')
	const after = grouped(rules, 'after').filter(
		(group) => !keeps(group, changes),
	)
	return {
		before: before.map((group) => ({
			check: counted(group),
			message: '',
			refuse: group.refuse,
		})),
		after: after.length > 0,
		verify: async (store, when = 'after') => {
			for (const group of when === 'after' ? after : before) {
				const { count, model, where } = counted(group)
				const read = { model, where }
				if ((await store.count(read)) !== count) throw group.refuse()
			}
		},
	}
}
