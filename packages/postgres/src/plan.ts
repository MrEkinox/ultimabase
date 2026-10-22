// The statements from one snapshot to another (D-105), in phases: foreign
// keys, keys and indexes that change are dropped first, then tables and
// columns change, then keys, indexes and foreign keys are added, so each
// statement finds what it needs.
import type { Statement } from 'ultimabase'
import type { Check, ForeignKey, Snapshot, TableSnapshot } from './snapshot.ts'

export const id = (name: string): string => `"${name.replaceAll('"', '""')}"`

const literal = (value: string): string => `'${value.replaceAll("'", "''")}'`

const list = (names: readonly string[]): string => names.map(id).join(', ')

const same = (a: unknown, b: unknown): boolean =>
	JSON.stringify(a) === JSON.stringify(b)

type Named<T> = { readonly [name: string]: T }

type Emit = (
	sql: string,
	does: string,
	more?: Pick<Statement, 'loses' | 'rename'>,
) => void

/** The entries of `from` that `to` lacks or defines otherwise. */
const changed = <T>(from: Named<T>, to: Named<T>): [string, T][] =>
	Object.entries(from).filter(([name, value]) => !same(value, to[name]))

/** The entries of `to` that `from` lacks or defines otherwise. */
const added = <T>(from: Named<T>, to: Named<T>): [string, T][] =>
	changed(to, from)

/** The model's names for columns, which messages use. */
const fields = (table: TableSnapshot, columns: readonly string[]): string =>
	columns.map((column) => table.columns[column]?.field ?? column).join(', ')

const checked = (name: string, { column, values }: Check): string =>
	`constraint ${id(name)} check (${id(column)} in (${values.map(literal).join(', ')}))`

/** A type as messages show it, without its collation. */
const shown = (type: string): string => type.replace(' collate "C"', '')

const column = (name: string, type: string, nullable: boolean): string =>
	`${id(name)} ${type}${nullable ? '' : ' not null'}`

/** Columns as a rename compares them: names, types and nullability. */
const shape = (table: TableSnapshot): unknown =>
	Object.entries(table.columns).map(([name, { type, nullable }]) => [
		name,
		type,
		nullable,
	])

function create(name: string, table: TableSnapshot): string {
	const parts = [
		...Object.entries(table.columns).map(([key, { type, nullable }]) =>
			column(key, type, nullable),
		),
		`constraint ${id(table.primaryKey.name)} primary key (${list(table.primaryKey.columns)})`,
		...Object.entries(table.uniques).map(
			([key, columns]) => `constraint ${id(key)} unique (${list(columns)})`,
		),
		...Object.entries(table.checks).map(([key, given]) => checked(key, given)),
	]
	return `create table ${id(name)} (\n\t${parts.join(',\n\t')}\n)`
}

/** Drops the keys, checks and indexes of `from` that `to` changes. */
function dropKeys(
	name: string,
	from: TableSnapshot,
	to: TableSnapshot,
	emit: Emit,
): void {
	const drop = (key: string) =>
		`alter table ${id(name)} drop constraint ${id(key)}`
	if (!same(from.primaryKey, to.primaryKey)) {
		emit(drop(from.primaryKey.name), 'dropped the primary key')
	}
	for (const [key, columns] of changed(from.uniques, to.uniques)) {
		emit(drop(key), `dropped the unique key on ${fields(from, columns)}`)
	}
	for (const [key, { column: on }] of changed(from.checks, to.checks)) {
		emit(drop(key), `dropped the values of ${fields(from, [on])}`)
	}
	for (const [key, columns] of changed(from.indexes, to.indexes)) {
		emit(
			`drop index ${id(key)}`,
			`dropped the index on ${fields(from, columns)}`,
		)
	}
}

/** Changes the columns of a table both snapshots hold. */
function alterColumns(
	name: string,
	from: TableSnapshot,
	to: TableSnapshot,
	emit: Emit,
): void {
	const table = `alter table ${id(name)}`
	const fresh = Object.entries(to.columns).filter(
		([key]) => from.columns[key] === undefined,
	)
	for (const [key, was] of Object.entries(from.columns)) {
		if (to.columns[key] !== undefined) continue
		const twin = fresh.find(([, now]) => now.type === was.type)
		emit(`${table} drop column ${id(key)}`, `removed ${was.field}`, {
			loses: `removing "${from.model}.${was.field}" deletes data`,
			...(twin === undefined
				? {}
				: {
						rename: {
							to: `${to.model}.${twin[1].field}`,
							dbName: key,
							sql: `${table} rename column ${id(key)} to ${id(twin[0])}`,
						},
					}),
		})
	}
	for (const [key, now] of Object.entries(to.columns)) {
		const was = from.columns[key]
		if (was === undefined) {
			emit(
				`${table} add column ${column(key, now.type, now.nullable)}`,
				`added ${now.field}`,
			)
			continue
		}
		if (was.type !== now.type) {
			emit(
				`${table} alter column ${id(key)} type ${now.type} using ${id(key)}::${now.type}`,
				`changed ${now.field} to ${shown(now.type)}`,
				{
					loses: `changing "${to.model}.${now.field}" from ${shown(was.type)} to ${shown(now.type)} rewrites its data`,
				},
			)
		}
		if (was.nullable !== now.nullable) {
			emit(
				`${table} alter column ${id(key)} ${now.nullable ? 'drop' : 'set'} not null`,
				`made ${now.field} ${now.nullable ? 'optional' : 'required'}`,
			)
		}
	}
}

/** Adds the keys and checks of `to` that `from` lacks or changed. */
function addKeys(
	name: string,
	from: TableSnapshot,
	to: TableSnapshot,
	emit: Emit,
): void {
	const add = (part: string) => `alter table ${id(name)} add ${part}`
	if (!same(from.primaryKey, to.primaryKey)) {
		const { name: key, columns } = to.primaryKey
		emit(
			add(`constraint ${id(key)} primary key (${list(columns)})`),
			`keyed on ${fields(to, columns)}`,
		)
	}
	for (const [key, columns] of added(from.uniques, to.uniques)) {
		emit(
			add(`constraint ${id(key)} unique (${list(columns)})`),
			`added a unique key on ${fields(to, columns)}`,
		)
	}
	for (const [key, given] of added(from.checks, to.checks)) {
		emit(
			add(checked(key, given)),
			`limited ${fields(to, [given.column])} to ${given.values.join(', ')}`,
		)
	}
}

const foreignKey = (
	table: string,
	key: string,
	{ column: name, table: target, cascade }: ForeignKey,
): string =>
	`alter table ${id(table)} add constraint ${id(key)} foreign key (${id(name)}) references ${id(target)} ("id")${cascade ? ' on delete cascade' : ''} deferrable initially deferred`

/** Every statement from `from`, or an empty database, to `to`. */
export function plan(from: Snapshot | undefined, to: Snapshot): Statement[] {
	const before: Named<TableSnapshot> = from?.tables ?? {}
	const after = to.tables
	const phases: Statement[][] = [[], [], [], [], [], [], []]
	const emit =
		(phase: number, model: string): Emit =>
		(sql, does, more = {}) => {
			phases[phase]?.push({ sql, model, does, ...more })
		}
	const fresh = Object.entries(after).filter(
		([name]) => before[name] === undefined,
	)
	for (const [name, table] of Object.entries(before)) {
		const now = after[name]
		const keys = changed(table.foreignKeys, now?.foreignKeys ?? {})
		for (const [key, { column: on }] of keys) {
			emit(0, table.model)(
				`alter table ${id(name)} drop constraint ${id(key)}`,
				`dropped the foreign key on ${fields(table, [on])}`,
			)
		}
		if (now !== undefined) {
			dropKeys(name, table, now, emit(1, now.model))
			alterColumns(name, table, now, emit(3, now.model))
			addKeys(name, table, now, emit(5, now.model))
			continue
		}
		const twin = fresh.find(([, created]) => same(shape(created), shape(table)))
		emit(2, table.model)(`drop table ${id(name)}`, 'removed', {
			loses: `removing ${table.model} deletes its rows`,
			...(twin === undefined
				? {}
				: {
						rename: {
							to: twin[1].model,
							dbName: name,
							sql: `alter table ${id(name)} rename to ${id(twin[0])}`,
						},
					}),
		})
	}
	for (const [name, table] of fresh) {
		emit(4, table.model)(create(name, table), 'created')
	}
	for (const [name, table] of Object.entries(after)) {
		const was = before[name]
		for (const [key, columns] of added(was?.indexes ?? {}, table.indexes)) {
			emit(5, table.model)(
				`create index ${id(key)} on ${id(name)} (${list(columns)})`,
				`indexed ${fields(table, columns)}`,
			)
		}
		const keys = added(was?.foreignKeys ?? {}, table.foreignKeys)
		for (const [key, given] of keys) {
			emit(6, table.model)(
				foreignKey(name, key, given),
				`added the foreign key on ${fields(table, [given.column])}`,
			)
		}
	}
	return phases.flat()
}
