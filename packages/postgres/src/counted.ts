// What each statement of a migration file changed (D-344). PostgreSQL answers
// every statement of a query with its command and row count, which `pg` keeps
// in a list and Kysely drops: a connection hands them over as rows instead.
import { Client, type ClientBase } from 'pg'
import type { Counted, Migration } from 'ultimabase'
import { split } from './split.ts'

/** A statement's answer: its command, such as `DELETE`, and its rows. */
export type Answer = { readonly command: unknown; readonly rowCount: unknown }

/** The texts whose answers come back as rows, and how many deploys run each. */
const asked = new Map<unknown, number>()

/** One row per statement of `answer`, a result or a list of them. */
const rowsOf = (answer: unknown): Answer[] =>
	[answer].flat().map((each: unknown) => {
		const result = typeof each === 'object' && each !== null ? each : {}
		return {
			command: 'command' in result ? result.command : undefined,
			rowCount: 'rowCount' in result ? result.rowCount : undefined,
		}
	})

/**
 * Has `client` answer what `counting` runs with one row per statement. A
 * client's own `query`, as `preparing` sets, is kept; otherwise its class's is
 * read at each call, as it would be without this.
 */
export function counted(client: ClientBase): void {
	const own = Object.hasOwn(client, 'query')
		? client.query.bind(client)
		: undefined
	Reflect.set(client, 'query', (...given: unknown[]): unknown => {
		const query = own ?? Client.prototype.query.bind(client)
		const result: unknown = Reflect.apply(query, undefined, given)
		if (asked.size === 0 || !asked.has(given[0])) return result
		if (!(result instanceof Promise)) return result
		return result.then((answer: unknown) => ({ rows: rowsOf(answer) }))
	})
}

/** Runs `text` with `run`, whose rows are then its statements' answers. */
export async function counting<T>(
	text: string,
	run: () => Promise<T>,
): Promise<T> {
	asked.set(text, (asked.get(text) ?? 0) + 1)
	try {
		return await run()
	} finally {
		const left = (asked.get(text) ?? 1) - 1
		if (left === 0) asked.delete(text)
		else asked.set(text, left)
	}
}

/** The commands that change rows. */
const changing: ReadonlySet<unknown> = new Set([
	'INSERT',
	'UPDATE',
	'DELETE',
	'MERGE',
])

/**
 * What the statements of `file` changed, from their answers. Statements the
 * split does not match, such as a `begin atomic` body, are named by rank.
 */
export function countsOf(
	file: Migration,
	answers: readonly Answer[],
): Counted[] {
	const statements = split(file.sql)
	const named = statements.length === answers.length
	return answers.flatMap(({ command, rowCount }, index) => {
		if (!changing.has(command) || typeof rowCount !== 'number') return []
		const statement = named ? statements[index] : undefined
		return [
			{
				at: file.name,
				statement: statement ?? `statement ${index + 1}`,
				command: String(command),
				rows: rowCount,
			},
		]
	})
}
