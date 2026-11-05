// SQL as text and parameters (D-257). A read or a write composes hundreds of
// fragments, per statement and per live read: this keeps what they say, in the
// order they say it, and writes the statement once, at the end.
import type { QueryExecutorProvider } from 'kysely'
import { CompiledQuery } from 'kysely'

type Rows = { readonly rows: readonly { readonly [column: string]: unknown }[] }

export class Sql {
	readonly strings: readonly string[]
	/** A fragment goes in as it is, anything else as a parameter. */
	readonly values: readonly unknown[]

	constructor(strings: readonly string[], values: readonly unknown[]) {
		this.strings = strings
		this.values = values
	}

	/** Runs the statement, in the transaction `db` may be. */
	async execute(db: QueryExecutorProvider): Promise<Rows> {
		const { text, parameters } = compiled(this)
		return db.getExecutor().executeQuery(CompiledQuery.raw(text, parameters))
	}
}

function written(piece: Sql, parameters: unknown[], before: string): string {
	const { strings, values } = piece
	let text = before
	for (const [at, part] of strings.entries()) {
		text += part
		if (at >= values.length) continue
		const item = values[at]
		if (item instanceof Sql) {
			text = written(item, parameters, text)
		} else {
			parameters.push(item)
			text += `$${parameters.length}`
		}
	}
	return text
}

/** The statement and its parameters, numbered as they come. */
export function compiled(piece: Sql): {
	readonly text: string
	readonly parameters: unknown[]
} {
	const parameters: unknown[] = []
	return { text: written(piece, parameters, ''), parameters }
}

/** How many parameters `piece` binds. */
export function sizeOf(piece: Sql): number {
	let size = 0
	for (const item of piece.values) {
		size += item instanceof Sql ? sizeOf(item) : 1
	}
	return size
}

const fixed = (text: string): Sql => new Sql([text], [])

const quoted = (name: string): string =>
	`"${name.includes('"') ? name.replaceAll('"', '""') : name}"`

const comma = fixed(', ')

function join(items: readonly unknown[], separator: Sql = comma): Sql {
	const values: unknown[] = []
	for (const [at, item] of items.entries()) {
		if (at > 0) values.push(separator)
		values.push(item)
	}
	return new Sql(
		Array.from({ length: values.length + 1 }, () => ''),
		values,
	)
}

type Tag = {
	(strings: TemplateStringsArray, ...values: readonly unknown[]): Sql
	/** A name, each part quoted: `"t1"."title"`. */
	readonly id: (...names: readonly string[]) => Sql
	/** A value in the text itself, for what takes no parameter. */
	readonly lit: (value: string | number) => Sql
	/** Text as it is: never what a caller gave. */
	readonly raw: (text: string) => Sql
	readonly join: typeof join
}

export const sql: Tag = Object.assign(
	(strings: TemplateStringsArray, ...values: readonly unknown[]) =>
		new Sql(strings, values),
	{
		id: (...names: readonly string[]) => fixed(names.map(quoted).join('.')),
		lit: (value: string | number) =>
			fixed(
				typeof value === 'string'
					? `'${value.replaceAll("'", "''")}'`
					: String(value),
			),
		raw: fixed,
		join,
	},
)
