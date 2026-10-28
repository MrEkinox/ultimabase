// The SQL a filter is made of (D-73): conditions joined with PostgreSQL's
// three-valued logic, and a `like` pattern that matches its text only.
import type { RawBuilder } from 'kysely'
import { sql } from 'kysely'

export type Sql = RawBuilder<unknown>

export function all(parts: readonly Sql[]): Sql {
	if (parts.length === 0) return sql`true`
	return parts.length === 1
		? (parts[0] ?? sql`true`)
		: sql`(${sql.join(parts, sql` and `)})`
}

export function any(parts: readonly Sql[]): Sql {
	if (parts.length === 0) return sql`false`
	return sql`(${sql.join(parts, sql` or `)})`
}

/** `%`, `_` and `\` are characters, not patterns (D-94). */
export function pattern(
	operand: unknown,
	before: string,
	after: string,
): string {
	const text = typeof operand === 'string' ? operand : ''
	return `${before}${text.replaceAll(/[\\%_]/g, '\\$&')}${after}`
}
