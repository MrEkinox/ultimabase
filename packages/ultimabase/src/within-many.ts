// The writes a many-to-many kept within the row's parent refuses (D-236): a
// link between two rows of different parents, from either side, or a parent
// change that leaves a link across two. The rows the write knows are compared
// as they end; the others are counted, as they were before it (D-99), a row's
// parent read first when the write knows neither side's (D-243).
import type { Change, Check, Filter } from './adapter.ts'
import type { Models } from './query-where.ts'
import { byId, byIds } from './query-where.ts'
import { invalid } from './write-data.ts'
import type { Store } from './transaction.ts'
import type { Checked } from './write-plan.ts'
import type { Ended } from './within-rows.ts'
import { idsOf, keyOf, storedParents } from './within-rows.ts'

/** One side of the relation: its model and its `many`. */
type Side = {
	readonly model: string
	readonly field: string
}

type Rule = {
	/** The side declaring it, then the other. */
	readonly sides: readonly [Side, Side]
	/** The `one` both models share. */
	readonly parent: string
	readonly message: string
}

/** The rows of a model the links need, all of which `filter` keeps. */
type Need = {
	readonly model: string
	readonly filter: Filter
	readonly name: string
	readonly ids: Set<string>
}

const cache = new WeakMap<Models, readonly Rule[]>()

/** The rules of the models' many-to-many relations kept within a parent. */
export function manyRulesOf(models: Models): readonly Rule[] {
	const cached = cache.get(models)
	if (cached !== undefined) return cached
	const rules: Rule[] = []
	for (const model of models.values()) {
		for (const field of model.fields.values()) {
			if (field.kind !== 'many' || field.within === undefined) continue
			const parent = field.within
			// The start checked both share the `one` (checkWithin), and that a
			// `many` names its own (D-237).
			rules.push({
				sides: [
					{ model: model.name, field: field.name },
					{ model: field.target, field: field.inverse ?? '' },
				],
				parent,
				message: `${model.name}.${field.name} needs a ${field.target} of the same ${parent}.`,
			})
		}
	}
	cache.set(models, rules)
	return rules
}

/** Each pair a write links, then unlinks, by `row|target` of the declared side. */
function pairsOf(rule: Rule, changes: readonly Change[]) {
	const [own, theirs] = rule.sides
	const linked = new Map<string, { pair: [string, string]; name: string }>()
	const unlinked = new Set<string>()
	for (const change of changes) {
		if (change.kind !== 'link' && change.kind !== 'unlink') continue
		const mine = change.model === own.model && change.field === own.field
		if (
			!mine &&
			(change.model !== theirs.model || change.field !== theirs.field)
		) {
			continue
		}
		for (const target of change.targets) {
			const pair: [string, string] = mine
				? [change.id, target]
				: [target, change.id]
			const key = pair.join('|')
			if (change.kind === 'link') {
				linked.set(key, { pair, name: change.field })
				unlinked.delete(key)
			} else {
				linked.delete(key)
				unlinked.add(key)
			}
		}
	}
	return { linked: [...linked.values()], unlinked }
}

/** Each row's parent as the write leaves it, and the rows it moves. */
function parentsOf(model: string, parent: string, { rows, blind }: Ended) {
	const ends = new Map<string, string>()
	const moved = new Map<string, string>()
	for (const [id, row] of rows.get(model) ?? []) {
		const q = keyOf(row.values[parent])
		if (q === null) continue
		ends.set(id, q)
		if (!row.fresh && row.wrote.has(parent)) moved.set(id, q)
	}
	// An update by id that read no row (D-99) moves the rows it names; the
	// others set no relation.
	for (const change of blind) {
		const q = change.model === model ? keyOf(change.set[parent]) : null
		if (q === null) continue
		for (const id of idsOf(change.where)) {
			ends.set(id, q)
			moved.set(id, q)
		}
	}
	return { ends, moved }
}

/** The rows whose parent is not `q`, as the write leaves them. */
function apart(ends: ReadonlyMap<string, string>, parent: string, q: string) {
	const bad = [...ends].flatMap(([id, p]) => (p === q ? [] : [id]))
	const others = { NOT: [byIds([...ends.keys()])] }
	const elsewhere = { NOT: [{ [parent]: { is: byId(q) } }] }
	return { OR: [byIds(bad), { AND: [others, elsewhere] }] }
}

/**
 * The checks a write's many-to-many `within` relations need; throws on a
 * link it knows breaks one.
 */
export async function withinManyChecks(
	rules: readonly Rule[],
	store: Pick<Store, 'find'>,
	changes: readonly Change[],
	known: Ended,
): Promise<Checked[]> {
	const checks: Checked[] = []
	for (const rule of rules) {
		const { parent, message, sides } = rule
		const [own, theirs] = sides
		const refuse = (name: string) => () => invalid([{ path: [name], message }])
		const add = (check: Check, name: string) =>
			checks.push({ check, message, refuse: refuse(name) })
		const parents = [
			parentsOf(own.model, parent, known),
			parentsOf(theirs.model, parent, known),
		] as const
		const [mine, yours] = parents
		const { linked, unlinked } = pairsOf(rule, changes)
		// The rows whose parent neither side of their link knows.
		const blind = linked.flatMap(({ pair: [row, target] }) =>
			mine.ends.has(row) || yours.ends.has(target) ? [] : [row],
		)
		const read = await storedParents(store, own.model, parent, blind)
		// The rows of a side a filter needs, each a target of a link.
		const needs = new Map<string, Need>()
		for (const { pair, name } of linked) {
			const [row, target] = pair
			const p = mine.ends.get(row) ?? read.get(row)
			const q = yours.ends.get(target)
			if (p !== undefined && q !== undefined) {
				if (p !== q) throw refuse(name)()
				continue
			}
			const at = p ?? q
			// A row that does not exist stays `NOT_FOUND`, by the others.
			if (at === undefined) continue
			// The side whose parent is unknown.
			const [side, id] = q === undefined ? [theirs, target] : [own, row]
			const filter = { [parent]: { is: byId(at) } }
			const key = `${side.model}|${name}|${at}`
			const group = needs.get(key) ?? {
				model: side.model,
				filter,
				name,
				ids: new Set<string>(),
			}
			needs.set(key, group)
			group.ids.add(id)
		}
		for (const { model, filter, name, ids } of needs.values()) {
			const where = { AND: [byIds([...ids]), filter] }
			add({ model, where, count: ids.size }, name)
		}
		// The rows a parent change leaves linked to a row of another parent.
		for (const [index, { moved }] of parents.entries()) {
			const [other, { ends }] = index === 0 ? [theirs, yours] : [own, mine]
			const linking = (id: string, q: string, left: readonly string[]) => {
				const where = [
					{ [other.field]: { some: byId(id) } },
					apart(ends, parent, q),
					{ NOT: [byIds([...known.gone, ...left])] },
				]
				add({ model: other.model, where: { AND: where }, count: 0 }, parent)
			}
			for (const [id, q] of moved) {
				const left = [...unlinked].flatMap((key) => {
					const [first = '', second = ''] = key.split('|')
					const [at, away] = index === 0 ? [first, second] : [second, first]
					return at === id ? [away] : []
				})
				linking(id, q, left)
			}
		}
	}
	return checks
}
