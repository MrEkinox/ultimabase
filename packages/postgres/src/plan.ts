// The statements from one snapshot to another (D-105), in phases: foreign
// keys, keys and indexes that change are dropped first, then tables and
// columns change, then keys, indexes and foreign keys are added, so each
// statement finds what it needs.
import type { Statement } from 'ultimabase'
import type { Fill, Fills } from './fills.ts'
import { literal } from './fills.ts'
import type { Check, ForeignKey, Snapshot, TableSnapshot } from './snapshot.ts'

export const id = (name: string): string => `"${name.replaceAll('"', '""')}"`

const list = (names: readonly string[]): string => names.map(id).join(', ')

const same = (a: unknown, b: unknown): boolean =>
	JSON.stringify(a) === JSON.stringify(b)

type Named<T> = { readonly [name: string]: T }

type Emit = (
	sql: string,
	does: string,
	more?: Pick<Statement, 'loses' | 'tries' | 'rename'>,
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

/** A key's columns as a tried change names them: `Locker (label, size)`. */
const keyOf = (table: TableSnapshot, columns: readonly string[]): string =>
	`${table.model} (${fields(table, columns)})`

/** An enum's values; a list's elements are among them, with `<@` (D-127). */
function checked(name: string, { column, values, list: all }: Check): string {
	const items = values.map(literal).join(', ')
	const test = all ? `<@ array[${items}]::text[]` : `in (${items})`
	return `constraint ${id(name)} check (${id(column)} ${test})`
}

/** A type as messages show it, without its collation. */
const shown = (type: string): string => type.replace(' collate "C"', '')

const column = (name: string, type: string, nullable: boolean): string =>
	`${id(name)} ${type}${nullable ? '' : ' not null'}`

/**
 * Columns as a rename compares them: names, types and nullability, sorted,
 * because a stored snapshot's columns come back in jsonb's order.
 */
const shape = (table: TableSnapshot): unknown =>
	Object.entries(table.columns)
		.map(([name, { type, nullable }]) => [name, type, nullable])
		.toSorted(([a], [b]) => String(a).localeCompare(String(b)))

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

/** An index, by GIN on a list (D-120, D-127): its column's type decides. */
type Index = { readonly columns: string[]; readonly gin: boolean }

const indexesOf = (table: TableSnapshot | undefined): Named<Index> =>
	Object.fromEntries(
		Object.entries(table?.indexes ?? {}).map(([key, columns]) => [
			key,
			{
				columns,
				gin: columns.some(
					(name) => table?.columns[name]?.type.endsWith('[]') === true,
				),
			},
		]),
	)

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
	for (const [key, { columns }] of changed(indexesOf(from), indexesOf(to))) {
		emit(
			`drop index ${id(key)}`,
			`dropped the index on ${fields(from, columns)}`,
		)
	}
}

/** Adds a column; a required one takes its fixed default in the rows. */
function addColumn(
	table: string,
	key: string,
	now: TableSnapshot['columns'][string],
	model: string,
	fill: Fill | undefined,
	emit: Emit,
): void {
	const add = `${table} add column ${column(key, now.type, now.nullable)}`
	if (now.nullable) return emit(add, `added ${now.field}`)
	if (fill === undefined) {
		return emit(add, `added ${now.field}`, {
			tries: `adding the required "${model}.${now.field}" fails when ${model} holds rows: make it optional, or give it a value as its default, not a function`,
		})
	}
	// The rows take the default; the column keeps none, as the models say.
	emit(`${add} default ${fill.sql}`, `added ${now.field}`)
	emit(
		`${table} alter column ${id(key)} drop default`,
		`${fill.shown} in the rows it held`,
	)
}

/** The types PostgreSQL converts no value of a type to, on PG 15 to 18. */
const arrays = ['text[]', 'double precision[]', 'integer[]']
const scalars = ['boolean', 'timestamptz', 'jsonb']
const unconvertible: Named<readonly string[]> = {
	'double precision': ['boolean', 'timestamptz', 'jsonb', ...arrays],
	integer: ['timestamptz', 'jsonb', ...arrays],
	boolean: ['double precision', 'timestamptz', 'jsonb', ...arrays],
	timestamptz: ['double precision', 'integer', 'boolean', 'jsonb', ...arrays],
	jsonb: ['timestamptz', ...arrays],
	'text[]': ['double precision', 'integer', ...scalars],
	'double precision[]': ['double precision', 'integer', ...scalars],
	'integer[]': ['double precision', 'integer', ...scalars],
}

/**
 * Whether converting reads each value: text or json to another type, or
 * anything but a boolean to whole numbers, which refuse a fraction (D-132).
 */
const reads = (from: string, to: string): boolean =>
	to.startsWith('integer')
		? from !== 'boolean'
		: (from === 'jsonb' || from.startsWith('text')) &&
			!to.startsWith('text collate')

/**
 * A date as text is `toISOString()`'s, whatever the session's time zone.
 * Whole numbers come from text, which refuses `1.5` that a cast rounds.
 */
const converted = (named: string, from: string, to: string): string =>
	from === 'timestamptz' && to.startsWith('text')
		? `to_char(${named} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`
		: `${named}::${to.startsWith('integer') && reads(from, to) ? 'text::' : ''}${to}`

/**
 * Changes a column's type. One PostgreSQL cannot convert loses its values,
 * as an added column has none: null, or its fixed default when required.
 */
function retype(
	table: string,
	key: string,
	[was, now]: [string, TableSnapshot['columns'][string]],
	model: string,
	fill: Fill | undefined,
	emit: Emit,
): void {
	const change = `changing "${model}.${now.field}" from ${shown(was)} to ${shown(now.type)}`
	const alter = `${table} alter column ${id(key)} type ${now.type}`
	const does = `changed ${now.field} to ${shown(now.type)}`
	if (!unconvertible[was]?.includes(now.type)) {
		return emit(`${alter} using ${converted(id(key), was, now.type)}`, does, {
			loses: `${change} rewrites its data`,
			...(reads(was, now.type)
				? {
						tries: `${change} fails when a row holds a value it cannot convert`,
					}
				: {}),
		})
	}
	const loses = `${change} deletes its data: PostgreSQL converts no ${shown(was)} to ${shown(now.type)}`
	if (!now.nullable && fill !== undefined) {
		return emit(
			`${alter} using ${fill.sql}`,
			`${does}, ${fill.shown} in the rows it held`,
			{ loses },
		)
	}
	emit(`${alter} using null`, `${does} without its values`, {
		loses,
		...(now.nullable
			? {}
			: {
					tries: `${change} empties it, which fails when ${model} holds rows: make it optional, or give it a value as its default, not a function`,
				}),
	})
}

/** Changes the columns of a table both snapshots hold. */
function alterColumns(
	name: string,
	from: TableSnapshot,
	to: TableSnapshot,
	fills: Named<Fill>,
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
			addColumn(table, key, now, to.model, fills[key], emit)
			continue
		}
		// Optional first, so a type that loses its values can hold none.
		if (!was.nullable && now.nullable) {
			emit(
				`${table} alter column ${id(key)} drop not null`,
				`made ${now.field} optional`,
			)
		}
		if (was.type !== now.type) {
			retype(table, key, [was.type, now], to.model, fills[key], emit)
		}
		if (was.nullable && !now.nullable) {
			emit(
				`${table} alter column ${id(key)} set not null`,
				`made ${now.field} required`,
				{
					tries: `making "${to.model}.${now.field}" required fails when a row holds no value`,
				},
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
			{
				tries: `keying ${keyOf(to, columns)} fails when two rows share a value`,
			},
		)
	}
	for (const [key, columns] of added(from.uniques, to.uniques)) {
		emit(
			add(`constraint ${id(key)} unique (${list(columns)})`),
			`added a unique key on ${fields(to, columns)}`,
			{
				tries: `a unique key on ${keyOf(to, columns)} fails when two rows share a value`,
			},
		)
	}
	for (const [key, given] of added(from.checks, to.checks)) {
		const field = fields(to, [given.column])
		const values = given.values.join(', ')
		emit(add(checked(key, given)), `limited ${field} to ${values}`, {
			tries: `limiting "${to.model}.${field}" to ${values} fails when a row holds another value`,
		})
	}
}

const foreignKey = (
	table: string,
	key: string,
	{ column: name, table: target, cascade }: ForeignKey,
): string =>
	`alter table ${id(table)} add constraint ${id(key)} foreign key (${id(name)}) references ${id(target)} ("id")${cascade ? ' on delete cascade' : ''} deferrable initially deferred`

/** Every statement from `from`, or an empty database, to `to`. */
export function plan(
	from: Snapshot | undefined,
	to: Snapshot,
	fills: Fills,
): Statement[] {
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
			alterColumns(name, table, now, fills[name] ?? {}, emit(3, now.model))
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
		for (const [key, { columns, gin }] of added(
			indexesOf(was),
			indexesOf(table),
		)) {
			emit(5, table.model)(
				`create index ${id(key)} on ${id(name)}${gin ? ' using gin' : ''} (${list(columns)})`,
				`indexed ${fields(table, columns)}`,
			)
		}
		const keys = added(was?.foreignKeys ?? {}, table.foreignKeys)
		for (const [key, given] of keys) {
			const field = fields(table, [given.column])
			emit(6, table.model)(
				foreignKey(name, key, given),
				`added the foreign key on ${field}`,
				// A column added with its key holds no value yet.
				was?.columns[given.column] === undefined
					? {}
					: {
							tries: `linking "${table.model}.${field}" fails when a row points to no row`,
						},
			)
		}
	}
	return phases.flat()
}
