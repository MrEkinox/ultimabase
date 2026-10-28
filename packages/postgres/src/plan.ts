// The statements from one snapshot to another (D-105), in phases: foreign
// keys, keys and indexes that change are dropped first, then tables and
// columns change, then keys, indexes and foreign keys are added, so each
// statement finds what it needs.
import type { Statement } from 'ultimabase'
import type { Fill, Fills } from './fills.ts'
import { literal } from './fills.ts'
import { addIndexes, addsTrigrams, dropIndexes } from './plan-indexes.ts'
import type { Emit, Named } from './plan-parts.ts'
import { added, changed, fields, id, list, same } from './plan-parts.ts'
import type { Check, ForeignKey, Snapshot, TableSnapshot } from './snapshot.ts'

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
	dropIndexes(name, from, to, emit)
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
	numeric: ['boolean', 'timestamptz', 'jsonb', ...arrays],
	integer: ['timestamptz', 'jsonb', ...arrays],
	boolean: ['double precision', 'numeric', 'timestamptz', 'jsonb', ...arrays],
	timestamptz: [
		'double precision',
		'numeric',
		'integer',
		'boolean',
		'jsonb',
		...arrays,
	],
	jsonb: ['timestamptz', ...arrays],
	'text[]': ['double precision', 'numeric', 'integer', ...scalars],
	'double precision[]': ['double precision', 'numeric', 'integer', ...scalars],
	'integer[]': ['double precision', 'numeric', 'integer', ...scalars],
}

/** A type without its precision and scale: `numeric(10,2)` is `numeric`. */
const family = (type: string): string =>
	type.startsWith('numeric(') ? 'numeric' : type

/**
 * Whether converting reads each value: text or json to another type,
 * anything but a boolean to whole numbers, which refuse a fraction (D-132),
 * anything to a decimal, which refuses more integer digits (D-145).
 */
const reads = (from: string, to: string): boolean =>
	to.startsWith('integer')
		? from !== 'boolean'
		: to.startsWith('numeric') ||
			((from === 'jsonb' || from.startsWith('text')) &&
				!to.startsWith('text collate'))

/**
 * A date as text is `toISOString()`'s, whatever the session's time zone.
 * Whole numbers come from text, which refuses `1.5` that a cast rounds; a
 * decimal's text through float8, as `12.00` is `12`.
 */
function converted(named: string, from: string, to: string): string {
	if (from === 'timestamptz' && to.startsWith('text')) {
		return `to_char(${named} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`
	}
	const whole = to.startsWith('integer') && reads(from, to)
	const via = from.startsWith('numeric') ? 'float8::' : ''
	return `${named}::${whole ? `${via}text::` : ''}${to}`
}

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
	if (!unconvertible[family(was)]?.includes(family(now.type))) {
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
	// The extension is database-wide; no plan drops it (D-141).
	const trigram = Object.entries(after).find(([name, table]) =>
		addsTrigrams(before[name], table),
	)
	if (trigram !== undefined) {
		emit(5, trigram[1].model)(
			'create extension if not exists pg_trgm',
			'installed pg_trgm',
		)
	}
	for (const [name, table] of Object.entries(after)) {
		const was = before[name]
		addIndexes(name, was, table, emit(5, table.model))
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
