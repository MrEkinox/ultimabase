// A json value's path filter as SQL (D-149), as `memory()` runs it.
import { sql } from 'kysely'
import type { Condition } from 'ultimabase'
import type { Sql } from './logic.ts'
import { all, pattern } from './logic.ts'

const jsonb = (item: unknown): Sql =>
	sql`cast(${JSON.stringify(item)} as jsonb)`
export const compares: { readonly [operator: string]: string } = {
	lt: '<',
	lte: '<=',
	gt: '>',
	gte: '>=',
}

/**
 * A json value's path filter (D-149): `#>` reaches the value, which an
 * operator tests when it has the operator's JSON type. A missing value stays
 * unknown, as in `memory()`.
 */
export function jsonPath(column: Sql, condition: Condition): Sql {
	const path = sql`cast(${condition.path ?? []} as text[])`
	const at = sql`(${column} #> ${path})`
	const text = sql`(${column} #>> ${path})`
	const insensitive = condition.mode === 'insensitive'
	const folded = insensitive ? sql`(${text} collate "default")` : text
	const like = sql.raw(insensitive ? 'ilike' : 'like')
	const typed = (type: string, test: Sql): Sql =>
		sql`(case when ${at} is null then null when jsonb_typeof(${at}) = ${type} then coalesce(${test}, false) else false end)`
	const parts: Sql[] = []
	for (const [operator, operand] of Object.entries(condition)) {
		if (operand === undefined || operator === 'path' || operator === 'mode') {
			continue
		}
		const strings = (before: string, after: string): Sql =>
			typed('string', sql`${folded} ${like} ${pattern(operand, before, after)}`)
		switch (operator) {
			case 'equals':
				parts.push(sql`${at} = ${jsonb(operand)}`)
				break
			case 'not':
				parts.push(sql`${at} <> ${jsonb(operand)}`)
				break
			case 'stringContains':
				parts.push(strings('%', '%'))
				break
			case 'stringStartsWith':
				parts.push(strings('', '%'))
				break
			case 'stringEndsWith':
				parts.push(strings('%', ''))
				break
			case 'arrayContains':
				parts.push(typed('array', sql`${at} @> ${jsonb(operand)}`))
				break
			case 'arrayStartsWith':
				parts.push(typed('array', sql`${at} -> 0 = ${jsonb(operand)}`))
				break
			case 'arrayEndsWith':
				parts.push(typed('array', sql`${at} -> -1 = ${jsonb(operand)}`))
				break
			default: {
				const compare = sql.raw(compares[operator] ?? '=')
				// Strings by code point, as everywhere (D-94).
				parts.push(
					typeof operand === 'number'
						? typed('number', sql`${at} ${compare} ${jsonb(operand)}`)
						: typed('string', sql`(${text} collate "C") ${compare} ${operand}`),
				)
			}
		}
	}
	return all(parts)
}
