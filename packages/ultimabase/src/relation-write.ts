// A relation write's operations (D-20, D-128, D-138), their shape checked:
// `connect`, `connectOrCreate` and `create`, and in an update `delete`,
// `disconnect`, `update` and, on a `many`, `set`.
import { InvalidQuery } from './errors.ts'
import { clean, entries, isObject, unknownKey } from './query-where.ts'
import type { Draft } from './write-data.ts'

/** `{ id }`, exactly. */
function ref(value: unknown, path: string): string {
	const given = entries(value, path)
	const [first] = given
	if (
		given.length !== 1 ||
		first?.[0] !== 'id' ||
		typeof first[1] !== 'string' ||
		!clean(first[1])
	) {
		throw new InvalidQuery(path, `${path} must be { id }.`)
	}
	return first[1]
}

/** The operations a relation write takes (D-128, D-138). */
function allowed(kind: 'one' | 'many', creating: boolean): readonly string[] {
	if (creating) return ['connect', 'connectOrCreate', 'create']
	const changing = kind === 'one' ? ['update'] : ['set', 'update']
	return [
		'connect',
		'connectOrCreate',
		'create',
		'delete',
		'disconnect',
		...changing,
	].toSorted()
}

function operations(
	value: unknown,
	path: string,
	model: string,
	kind: 'one' | 'many',
	creating: boolean,
): Map<string, unknown> {
	if (value === null) {
		throw new InvalidQuery(path, `${path} cannot be null; use disconnect.`)
	}
	const given = new Map(entries(value, path))
	for (const key of given.keys()) {
		if (!allowed(kind, creating).includes(key))
			throw unknownKey(`${path}.${key}`, model)
	}
	return given
}

/** Data a nested `create` or `update` writes (D-128, D-138). */
function made(value: unknown, path: string): Draft {
	if (!isObject(value)) {
		throw new InvalidQuery(path, `${path} must be an object.`)
	}
	return value
}

/** An object of exactly `keys`. */
function exactly(
	value: unknown,
	path: string,
	keys: readonly [string, string],
): Map<string, unknown> {
	const given = new Map(entries(value, path))
	if (given.size !== 2 || !keys.every((key) => given.has(key))) {
		throw new InvalidQuery(path, `${path} must be { ${keys.join(', ')} }.`)
	}
	return given
}

/** A `connectOrCreate`: the unique target it looks for, the row it creates. */
export type OrCreate = { readonly where: unknown; readonly create: Draft }

function orCreate(value: unknown, path: string): OrCreate {
	const given = exactly(value, path, ['where', 'create'])
	return {
		where: given.get('where'),
		create: made(given.get('create'), `${path}.create`),
	}
}

/** A `many` relation's `update`: a unique target, and its data. */
export type Updating = { readonly where: unknown; readonly data: Draft }

function updating(value: unknown, path: string): Updating {
	const given = exactly(value, path, ['where', 'data'])
	return {
		where: given.get('where'),
		data: made(given.get('data'), `${path}.data`),
	}
}

function list(value: unknown, path: string): readonly unknown[] {
	if (!Array.isArray(value))
		throw new InvalidQuery(path, `${path} must be a list.`)
	return value
}

/** A `one` relation write. */
export type OneWrite =
	| { readonly kind: 'connect'; readonly id: string }
	| { readonly kind: 'create'; readonly data: Draft }
	| ({ readonly kind: 'connectOrCreate' } & OrCreate)
	| { readonly kind: 'update'; readonly data: Draft }
	| { readonly kind: 'delete' }
	| { readonly kind: 'disconnect' }

export function oneWrite(
	value: unknown,
	path: string,
	model: string,
	creating: boolean,
): OneWrite {
	const given = operations(value, path, model, 'one', creating)
	const [entry] = given
	if (entry === undefined || given.size !== 1) {
		throw new InvalidQuery(
			path,
			`${path} takes one of ${allowed('one', creating).join(', ')}.`,
		)
	}
	const [key, operand] = entry
	const at = `${path}.${key}`
	if (key === 'connect') return { kind: key, id: ref(operand, at) }
	if (key === 'create' || key === 'update') {
		return { kind: key, data: made(operand, at) }
	}
	if (key === 'connectOrCreate') return { kind: key, ...orCreate(operand, at) }
	if (operand !== true) throw new InvalidQuery(at, `${at} must be true.`)
	return { kind: key === 'delete' ? 'delete' : 'disconnect' }
}

/** A `many` relation write, each operation's list. */
export type ManyWrite = {
	readonly connect: string[]
	readonly disconnect: string[]
	readonly create: Draft[]
	readonly set: string[] | undefined
	readonly connectOrCreate: OrCreate[]
	readonly update: Updating[]
	readonly delete: unknown[]
}

export function manyWrite(
	value: unknown,
	path: string,
	model: string,
	creating: boolean,
): ManyWrite {
	const given = operations(value, path, model, 'many', creating)
	const each = <T>(key: string, read: (item: unknown, at: string) => T): T[] =>
		list(given.get(key) ?? [], `${path}.${key}`).map((item, index) =>
			read(item, `${path}.${key}.${index}`),
		)
	if (given.has('set') && (given.has('connect') || given.has('disconnect'))) {
		throw new InvalidQuery(
			`${path}.set`,
			`${path}.set cannot be used with connect or disconnect.`,
		)
	}
	return {
		// A row disconnected and connected again stays linked (D-101).
		connect: each('connect', ref),
		disconnect: each('disconnect', ref),
		create: each('create', made),
		set: given.has('set') ? each('set', ref) : undefined,
		connectOrCreate: each('connectOrCreate', orCreate),
		update: each('update', updating),
		delete: each('delete', (item) => item),
	}
}
