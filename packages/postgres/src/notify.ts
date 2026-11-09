// What a write changed, told by its own statements (D-154): each part's rows
// go to `pg_notify` by chunks that fit its 8000 bytes, or as `null` past
// `feedIds`. The notifications leave with the commit; a rollback drops them.
import { sql } from './text.ts'
import type { Changed } from 'ultimabase'
import { feedFields, feedIds } from 'ultimabase'
import type { Sql } from './filter.ts'

/** What the feed says of a part: its head, then an item per row. */
export type Noted = {
	/** The JSON array's start: kind, model, then the field or fields. */
	readonly head: string
	readonly item: Sql
	/** How many items a notification holds. */
	readonly per: number
}

/** The most keys a delete tells: `json_build_array` takes 100 arguments. */
const mostKeys = 99

/**
 * A part of rows, told by their ids: 150 of 40 bytes fit beside a head. A
 * delete's rows come with the `keys` they stored, as `[field, column]`,
 * each row then an array of its id and keys, when they fit (D-196).
 */
export function rows(
	kind: 'insert' | 'update' | 'delete',
	model: string,
	fields?: readonly string[],
	keys: readonly (readonly [string, string])[] = [],
): Noted {
	const names = keys.map(([field]) => field)
	if (
		kind === 'delete' &&
		keys.length > 0 &&
		keys.length <= mostKeys &&
		JSON.stringify(names).length <= feedFields
	) {
		const head = JSON.stringify([kind, model, names]).slice(0, -1)
		const columns = [sql.id('id'), ...keys.map(([, column]) => sql.id(column))]
		const item = sql`json_build_array(${sql.join(columns)})`
		return { head: `${head},`, item, per: Math.floor(150 / columns.length) }
	}
	const listed =
		fields === undefined || JSON.stringify(fields).length > feedFields
			? null
			: fields
	const head = JSON.stringify([kind, model, listed]).slice(0, -1)
	return { head: `${head},`, item: sql.id('id'), per: 150 }
}

/** A part of a join table, told by its pairs, the model's id first. */
export function pairs(
	kind: 'link' | 'unlink',
	model: string,
	field: string,
	self: string,
	other: string,
): Noted {
	const head = JSON.stringify([kind, model, field]).slice(0, -1)
	const item = sql`json_build_array(${sql.id(self)}, ${sql.id(other)})`
	return { head: `${head},`, item, per: 75 }
}

/** The CTE that tells `channel` what each of `parts`, by its CTE, wrote. */
export function notifying(
	channel: string,
	parts: readonly (readonly [Sql, Noted])[],
): Sql {
	const to = sql.lit(channel)
	const most = sql.lit(feedIds)
	const each = parts.map(([from, noted]) => {
		const head = sql.lit(noted.head)
		const count = sql`(select count(*) from ${from})`
		const chunked = sql`select ${noted.item} as "item", (row_number() over () - 1) / ${sql.lit(noted.per)} as "k" from ${from}`
		return sql`select pg_notify(${to}, ${head} || json_agg("s"."item")::text || ']') from (${chunked}) as "s" where ${count} <= ${most} group by "s"."k" union all select pg_notify(${to}, ${head} || 'null]') where ${count} > ${most}`
	})
	return sql`"#feed" as materialized (${sql.join(each, sql` union all `)})`
}

const kinds = new Set(['insert', 'update', 'delete', 'link', 'unlink'])

const strings = (value: unknown): value is string[] =>
	Array.isArray(value) && value.every((item) => typeof item === 'string')

const pairList = (value: unknown): value is [string, string][] =>
	Array.isArray(value) &&
	value.every((item) => strings(item) && item.length === 2)

/** A notification's payload as the change it tells, if it is one. */
export function changedOf(payload: string | undefined): Changed | undefined {
	let parsed: unknown
	try {
		parsed = JSON.parse(payload ?? '')
	} catch {
		return undefined
	}
	if (!Array.isArray(parsed) || parsed.length !== 4) return undefined
	const kind: unknown = parsed[0]
	const model: unknown = parsed[1]
	const target: unknown = parsed[2]
	const listed: unknown = parsed[3]
	if (typeof kind !== 'string' || !kinds.has(kind)) return undefined
	if (typeof model !== 'string') return undefined
	if (kind === 'link' || kind === 'unlink') {
		if (typeof target !== 'string') return undefined
		if (listed !== null && !pairList(listed)) return undefined
		return { kind, model, field: target, ...(listed ? { pairs: listed } : {}) }
	}
	if (kind !== 'insert' && kind !== 'update' && kind !== 'delete') {
		return undefined
	}
	if (target !== null && !strings(target)) return undefined
	if (kind === 'delete' && target !== null)
		return deleted(model, target, listed)
	if (listed !== null && !strings(listed)) return undefined
	return {
		kind,
		model,
		...(target ? { fields: target } : {}),
		...(listed ? { ids: listed } : {}),
	}
}

const keyed = (
	value: unknown,
	size: number,
): value is [string, ...(string | null)[]][] =>
	Array.isArray(value) &&
	value.every(
		(item) =>
			Array.isArray(item) &&
			item.length === size &&
			typeof item[0] === 'string' &&
			item.every((key) => key === null || typeof key === 'string'),
	)

/** A delete whose rows come with the keys `names` (D-196). */
function deleted(
	model: string,
	names: readonly string[],
	listed: unknown,
): Changed | undefined {
	if (listed === null) return { kind: 'delete', model }
	if (!keyed(listed, names.length + 1)) return undefined
	const ids = listed.map(([id]) => id)
	const keys = Object.fromEntries(
		names.map((name, at) => [name, listed.map((row) => row[at + 1] ?? null)]),
	)
	return { kind: 'delete', model, ids, keys }
}
