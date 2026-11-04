// The writes a relation kept within the row's parent refuses (D-220). The
// rows a write inserts, or updates by id from the row it read, are compared
// as they end; the others are counted by the write's checks (D-99), against
// the rows as they were before it.
import type { Change, Check, Filter } from './adapter.ts'
import type { Event } from './hooks.ts'
import type { Models } from './query-where.ts'
import { byId, byIds } from './query-where.ts'
import { invalid } from './write-data.ts'
import type { Checked } from './write-plan.ts'
import { manyRulesOf, withinManyChecks } from './within-many.ts'
import { keyOf, knownRows } from './within-rows.ts'
import type { Within } from './within-schema.ts'

type Rule = {
	/** The row's model and relation, kept within `source`'s parent. */
	readonly model: string
	readonly field: string
	readonly within: Within
	readonly target: string
	/** The parent's `many` facing the target's field. */
	readonly inverse: string
	readonly message: string
}

const cache = new WeakMap<Models, readonly Rule[]>()

function rulesOf(models: Models): readonly Rule[] {
	const cached = cache.get(models)
	if (cached !== undefined) return cached
	const rules: Rule[] = []
	for (const model of models.values()) {
		for (const field of model.fields.values()) {
			if (field.kind !== 'one' || field.within === undefined) continue
			const theirs = models.get(field.target)?.fields.get(field.within.target)
			rules.push({
				model: model.name,
				field: field.name,
				within: field.within,
				target: field.target,
				// The start checked it is a `one` with its other side (checkWithin).
				inverse: theirs?.kind === 'one' ? (theirs.inverse ?? '') : '',
				message: `${model.name}.${field.name} needs a ${field.target} of the same ${field.within.target}.`,
			})
		}
	}
	cache.set(models, rules)
	return rules
}

/** The rule's rows whose parent is unset or not the one `parent` finds. */
function apart(rule: Rule, parent: Filter): Filter {
	const { source } = rule.within
	if (source === 'id') return { NOT: [parent] }
	return {
		OR: [{ [source]: { is: null } }, { NOT: [{ [source]: { is: parent } }] }],
	}
}

/**
 * The checks a write's `within` relations need, after its others so a
 * missing row stays `NOT_FOUND`; throws on a row it knows breaks one.
 */
export function withinChecks(
	models: Models,
	changes: readonly Change[],
	events: readonly Event[],
): Checked[] {
	const rules = rulesOf(models)
	const many = manyRulesOf(models)
	if (rules.length === 0 && many.length === 0) return []
	const ended = knownRows(changes, events)
	const { rows, blind } = ended
	const checks = withinManyChecks(many, changes, ended)
	for (const rule of rules) {
		const { model, field, target, message } = rule
		const { source, target: parent } = rule.within
		const refuse = (name: string) => () => invalid([{ path: [name], message }])
		const add = (check: Check, name: string) =>
			checks.push({ check, message, refuse: refuse(name) })
		const targets = rows.get(target)
		// Each parent's targets, which the rows written link.
		const linked = new Map<string, { ids: Set<string>; name: string }>()
		const decide = (m: string, p: string, name: string) => {
			const known = targets?.get(m)
			if (known !== undefined) {
				if (keyOf(known.values[parent]) !== p) throw refuse(name)()
				return
			}
			const group = linked.get(p) ?? { ids: new Set<string>(), name }
			group.ids.add(m)
			linked.set(p, group)
		}
		// The rows this write deletes or links again, which a moved target leaves.
		const settled: Filter[] = []
		const written: string[] = []
		for (const [id, row] of rows.get(model) ?? []) {
			const m = keyOf(row.values[field])
			const p = source === 'id' ? id : keyOf(row.values[source])
			const mine = row.fresh || row.wrote.has(field) || row.wrote.has(source)
			if (mine && !row.fresh) written.push(id)
			const theirs = m !== null && targets?.get(m)
			const moved = theirs && (theirs.fresh || theirs.wrote.has(parent))
			if (m === null || (!mine && !moved)) continue
			const name = !mine
				? parent
				: row.wrote.has(field) || row.fresh
					? field
					: source
			if (p !== null) decide(m, p, name)
			// A target needs the row's parent: an unset one holds none (D-235).
			else if (mine) throw refuse(name)()
		}
		for (const change of blind) {
			if (change.model !== model) continue
			if (field in change.set || source in change.set) {
				settled.push(change.where)
			}
			const m = field in change.set ? keyOf(change.set[field]) : undefined
			const p = source in change.set ? keyOf(change.set[source]) : undefined
			if (m === null) continue
			if (p === null) {
				if (m !== undefined) throw refuse(field)()
				// The rows it leaves linked, unless the write empties them too.
				const emptied = blind.flatMap((other) =>
					other.model === model &&
					field in other.set &&
					other.set[field] === null
						? [{ NOT: [other.where] }]
						: [],
				)
				const held = { [field]: { isNot: null } }
				const where = { AND: [change.where, held, ...emptied] }
				add({ model, where, count: 0 }, source)
			} else if (m !== undefined && p !== undefined) decide(m, p, field)
			else if (m !== undefined) {
				const known = targets?.get(m)
				const q = known && keyOf(known.values[parent])
				const where = apart(
					rule,
					q ? byId(q) : { [rule.inverse]: { some: byId(m) } },
				)
				add({ model, where: { AND: [change.where, where] }, count: 0 }, field)
			} else if (p !== undefined) {
				const other = { NOT: [{ [parent]: { is: byId(p) } }] }
				const where = { AND: [change.where, { [field]: { is: other } }] }
				add({ model, where, count: 0 }, source)
			}
		}
		for (const [p, { ids, name }] of linked) {
			const where = { AND: [byIds([...ids]), { [parent]: { is: byId(p) } }] }
			add({ model: target, where, count: ids.size }, name)
		}
		for (const change of changes) {
			if (change.kind === 'delete' && change.model === model) {
				settled.push(change.where)
			}
		}
		if (written.length > 0) settled.push(byIds(written))
		// The rows the database holds that link a target moved to another parent.
		for (const change of changes) {
			if (change.kind !== 'update' || change.model !== target) continue
			const q = parent in change.set ? keyOf(change.set[parent]) : null
			if (q === null) continue
			const where = [
				{ [field]: { is: change.where } },
				apart(rule, byId(q)),
				...settled.map((each) => ({ NOT: [each] })),
			]
			add({ model, where: { AND: where }, count: 0 }, parent)
		}
	}
	return checks
}
