// The reads a flush makes (D-154): the root rows a relation's rows reach, and
// a filter checked on a few rows, in memory when it reads the row alone.
import type { Filter, Row } from 'ultimabase'
import type { Judge, LivePlan } from 'ultimabase/internal'
import {
	afterKeys,
	inMemory,
	liveSchema,
	matches,
	required,
	storedRows,
} from 'ultimabase/internal'
import type { Finder } from './affected.ts'
import { loosened } from './levels.ts'
import type { Loader } from './loader.ts'
import { among, both, through } from './loader.ts'
import { modelsOf } from './reach.ts'
import { possible } from './needs.ts'
import type { Keys, Window } from './window.ts'

/**
 * Finds root rows of `model`, read once per flush for every live read that
 * asks (D-252); past what one read holds, one query for the rows of a window.
 */
export const finderOf =
	(model: string, loader: Loader): Finder =>
	async (steps, ids, within) => {
		const shared = await loader.reaching(model, steps, ids)
		if (shared !== undefined) {
			return within === undefined
				? shared
				: shared.filter((id) => within.has(id))
		}
		const reach = through(steps, among(ids))
		const where =
			within === undefined ? reach : { AND: [among([...within.keys()]), reach] }
		const rows = await storedRows(model, { where, fields: ['id'] })
		return rows.map(({ id }) => id)
	}

/**
 * The stored rows that pass `after`, from the plan's `where` and in order: from
 * the flush's read of the read's own filter when its rights, checked in memory,
 * leave enough. Fewer than `take` are all there are.
 */
async function rowsAfter(
	model: string,
	plan: LivePlan,
	after: Filter | undefined,
	take: number,
	loader?: Loader,
): Promise<readonly Row[]> {
	const { where, rights, orderBy } = plan
	if (loader !== undefined && inMemory(model, rights)) {
		const rows = await loader.after(model, plan, after, take)
		const kept = rows.filter((row) => matches(model, row, rights))
		if (kept.length >= take || rows.length < take) return kept.slice(0, take)
	}
	const filter = both(where, after)
	return storedRows(model, {
		...(filter && { where: filter }),
		orderBy,
		take,
		fields: orderBy.map(({ field }) => field),
	})
}

/**
 * The rows that follow a window, from the keys it holds rather than from what
 * its last row has become, which a flush has yet to tell (D-288), and whether
 * more follow. A row it holds elsewhere is one that flush will place; a row
 * `gone` is one this flush just refused, which its page may still bring.
 */
export async function following(
	model: string,
	plan: LivePlan,
	window: Window,
	gone: ReadonlySet<string>,
	entry: (row: Row) => Keys,
	loader?: Loader,
): Promise<{ readonly entries: readonly Keys[]; readonly rest: boolean }> {
	const missing = window.missing()
	const held = window.ids()
	const seen = new Set<string>()
	const entries: Keys[] = []
	let keys = window.lastKeys()
	for (;;) {
		const take = missing - entries.length + 1
		const after =
			keys &&
			(loader?.past(model, plan, keys) ?? afterKeys(model, keys, plan.orderBy))
		const rows = await rowsAfter(model, plan, after, take, loader)
		for (const row of rows) {
			if (held.has(row.id) || gone.has(row.id) || seen.has(row.id)) continue
			if (entries.length === missing) return { entries, rest: true }
			seen.add(row.id)
			entries.push(entry(row))
		}
		const last = rows.at(-1)
		if (last === undefined || rows.length < take) {
			return { entries, rest: false }
		}
		keys = entry(last)
	}
}

/** What a row answers alone of a filter, and the conditions it can't. */
type Split = {
	readonly local: Filter
	readonly rest: readonly Filter[]
	/** The rest as one filter, which a row's related rows may refuse. */
	readonly whole: Filter
}

const splits = new WeakMap<Filter, Split>()

function splitOf(model: string, filter: Filter): Split {
	const known = splits.get(filter)
	if (known !== undefined) return known
	const models = modelsOf(liveSchema())
	const parts = required(filter)
	const rest = parts.filter((part) => !inMemory(model, part))
	const split = {
		local: {
			AND: [
				...parts.filter((part) => inMemory(model, part)),
				// What a row of the rest passes too, a related id for one (D-255).
				...rest.flatMap((part) => {
					const loose = loosened(models, model, part)
					return loose === undefined ? [] : [loose]
				}),
			],
		},
		rest,
		whole: { AND: rest },
	}
	splits.set(filter, split)
	return split
}

const ids = (rows: readonly Row[]) => rows.map(({ id }) => id)

type Tried = {
	readonly left: readonly Row[]
	/** What the rows held did not settle, which a query may. */
	readonly rest: readonly Filter[]
}

/** What `rows` leave of `filter`, answered in memory and by related rows. */
async function tried(
	model: string,
	rows: ReadonlyMap<string, Row>,
	filter: Filter,
	loader: Loader,
): Promise<Tried> {
	const { local, rest, whole } = splitOf(model, filter)
	const kept = [...rows.values()].filter((row) => matches(model, row, local))
	if (kept.length === 0 || rest.length === 0) return { left: kept, rest: [] }
	const { rows: left, sure } = await possible(model, kept, whole, loader)
	return { left, rest: left.length === 0 || sure ? [] : rest }
}

/**
 * The ids of `rows` that pass `filter`: what a row answers alone in memory,
 * what the rows related to it can refuse, read once per flush (D-255), and a
 * query only for what those rows leave open (D-252, D-259).
 */
export async function pass(
	model: string,
	rows: ReadonlyMap<string, Row>,
	filter: Filter | undefined,
	loader: Loader,
): Promise<ReadonlySet<string>> {
	if (filter === undefined || rows.size === 0) return new Set(rows.keys())
	const { left, rest } = await tried(model, rows, filter, loader)
	if (rest.length === 0) return new Set(ids(left))
	const where = { AND: [among(ids(left)), ...rest] }
	const passed = await storedRows(model, { where, fields: ['id'] })
	return new Set(passed.map(({ id }) => id))
}

/**
 * Tells which of `rows`, stored whole, pass a filter, once for a read, when
 * the rows a flush holds answer without a query (D-259).
 */
export function judgeOf(
	model: string,
	rows: ReadonlyMap<string, Row>,
	loader: Loader,
): Judge {
	const known = new Map<Filter, Promise<ReadonlySet<string> | undefined>>()
	return async (filter) => {
		const found =
			known.get(filter) ??
			tried(model, rows, filter, loader).then(({ left, rest }) =>
				rest.length === 0 ? new Set(ids(left)) : undefined,
			)
		known.set(filter, found)
		return found
	}
}
