// What the statements of a plan share: quoted names, and the entries one
// snapshot changes in another (D-105).
import type { Statement } from 'ultimabase'
import type { TableSnapshot } from './snapshot.ts'

export const id = (name: string): string => `"${name.replaceAll('"', '""')}"`

export const list = (names: readonly string[]): string =>
	names.map(id).join(', ')

export const same = (a: unknown, b: unknown): boolean =>
	JSON.stringify(a) === JSON.stringify(b)

export type Named<T> = { readonly [name: string]: T }

export type Emit = (
	sql: string,
	does: string,
	more?: Pick<Statement, 'loses' | 'tries' | 'rename'>,
) => void

/** The entries of `from` that `to` lacks or defines otherwise. */
export const changed = <T>(from: Named<T>, to: Named<T>): [string, T][] =>
	Object.entries(from).filter(([name, value]) => !same(value, to[name]))

/** The entries of `to` that `from` lacks or defines otherwise. */
export const added = <T>(from: Named<T>, to: Named<T>): [string, T][] =>
	changed(to, from)

/** The model's names for columns, which messages use. */
export const fields = (
	table: TableSnapshot,
	columns: readonly string[],
): string =>
	columns.map((column) => table.columns[column]?.field ?? column).join(', ')

/** A key's model and fields, as `User (username)`. */
export const keyOf = (
	table: TableSnapshot,
	columns: readonly string[],
): string => `${table.model} (${fields(table, columns)})`
