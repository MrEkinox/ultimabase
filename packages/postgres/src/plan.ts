// The statements from one snapshot to another (D-105), in phases: foreign
// keys, keys and indexes that change are dropped first, then tables and
// columns change, then keys, indexes and foreign keys are added, so each
// statement finds what it needs.
import type { Statement } from 'ultimabase'
import type { Fill, Fills } from './fills.ts'
import { addIndexes, addsTrigrams } from './plan-indexes.ts'
import { addKeys, checked, dropKeys } from './plan-keys.ts'
import type { Emit, Named } from './plan-parts.ts'
import { added, changed, fields, id, list, same } from './plan-parts.ts'
import type { ForeignKey, Snapshot, TableSnapshot } from './snapshot.ts'

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
	if (fill.rows) {
		const empty = `${table} add column ${column(key, now.type, true)}`
		emit(empty, `added ${now.field}`)
		emit(fill.sql, `${fill.shown} in the rows it held`)
		emit(
			`${table} alter column ${id(key)} set not null`,
			`made ${now.field} required`,
		)
		return
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
const scalars = ['boolean', 'timestamptz', 'date', 'jsonb']
const numbers = ['double precision', 'numeric', 'integer']
const unconvertible: Named<readonly string[]> = {
	'double precision': ['boolean', 'timestamptz', 'date', 'jsonb', ...arrays],
	numeric: ['boolean', 'timestamptz', 'date', 'jsonb', ...arrays],
	integer: ['timestamptz', 'date', 'jsonb', ...arrays],
	boolean: [
		'double precision',
		'numeric',
		'timestamptz',
		'date',
		'jsonb',
		...arrays,
	],
	date: [...numbers, 'boolean', 'jsonb', ...arrays],
	timestamptz: [
		'double precision',
		'numeric',
		'integer',
		'boolean',
		'jsonb',
		...arrays,
	],
	jsonb: ['timestamptz', 'date', ...arrays],
	'text[]': [...numbers, ...scalars],
	'double precision[]': [...numbers, ...scalars],
	'integer[]': [...numbers, ...scalars],
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
 * A date as text is `toISOString()`'s, whatever the session's time zone; a
 * day is `YYYY-MM-DD` whatever its `DateStyle`, and an instant's day is UTC's.
 * Whole numbers come from text, which refuses `1.5` that a cast rounds; a
 * decimal's text through float8, as `12.00` is `12`.
 */
function converted(named: string, from: string, to: string): string {
	if (from === 'timestamptz' && to.startsWith('text')) {
		return `to_char(${named} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`
	}
	if (from === 'date' && to.startsWith('text')) {
		return `to_char(${named}, 'YYYY-MM-DD')`
	}
	if (from === 'timestamptz' && to === 'date') {
		return `(${named} at time zone 'UTC')::date`
	}
	if (from === 'date' && to === 'timestamptz') {
		return `(${named}::timestamp at time zone 'UTC')`
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

const foreignKey = (
	table: string,
	key: string,
	{ column: name, table: target, cascade, within, follows }: ForeignKey,
): string => {
	const [columns, theirs] = within
		? [
				[name, within.column],
				['id', within.target],
			]
		: [[name], ['id']]
	return `alter table ${id(table)} add constraint ${id(key)} foreign key (${list(columns)}) references ${id(target)} (${list(theirs)})${cascade ? ' on delete cascade' : ''}${follows ? ' on update cascade' : ''} deferrable initially deferred`
}

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
			const within = given.within && fields(table, [given.within.column])
			emit(6, table.model)(
				foreignKey(name, key, given),
				`added the foreign key on ${field}`,
				// A column added with its key holds no value yet.
				was?.columns[given.column] === undefined
					? {}
					: {
							tries: within
								? `keeping "${table.model}.${field}" within ${within} fails when a row links outside it`
								: `linking "${table.model}.${field}" fails when a row points to no row`,
						},
			)
		}
	}
	return phases.flat()
}
