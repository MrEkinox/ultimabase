// The filters a write rule returns (D-214): each row a write changes
// matches its rule's filter, before an update or a delete in the write's own
// checks, after a create or an update once the write ran, in its
// transaction.
import type { Write } from './access.ts'
import type { Filter } from './adapter.ts'
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
	readonly id: string
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
	const id = typeof stored === 'string' ? stored : write.id
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
	readonly refuse: () => PublicError
}

function grouped(
	rules: readonly RowRule[],
	when: 'before' | 'after',
): readonly Group[] {
	const groups = new Map<string, Group>()
	for (const rule of rules) {
		if (!rule[when]) continue
		const group = groups.get(rule.key) ?? { ...rule, ids: new Set() }
		group.ids.add(rule.id)
		groups.set(rule.key, group)
	}
	return [...groups.values()]
}

const counted = ({ model, where, ids }: Group) => ({
	model,
	where: { AND: [byIds([...ids]), where] },
	count: ids.size,
})

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
): RowChecks {
	const rules = access?.rowRules() ?? []
	const before = grouped(rules, 'before')
	const after = grouped(rules, 'after')
	return {
		before: before.map((group) => ({
			check: counted(group),
			message: '',
			refuse: group.refuse,
		})),
		after: after.length > 0,
		verify: async (store, when = 'after') => {
			for (const group of when === 'after' ? after : before) {
				const { count, ...read } = counted(group)
				if ((await store.count(read)) !== count) throw group.refuse()
			}
		},
	}
}
