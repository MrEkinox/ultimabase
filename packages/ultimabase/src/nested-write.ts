// A relation write's `set`, `connectOrCreate`, `update` and `delete`,
// resolved before the rules see it (D-138): the linked rows each one reaches,
// read locked, and `set` and `connectOrCreate` as the links they stand for.
import { and } from './access.ts'
import type { Filter, Row } from './adapter.ts'
import { InvalidQuery, PublicError } from './errors.ts'
import { computeOn, operationsOf } from './number-update.ts'
import { uniqueWhere } from './query-args.ts'
import { isObject, modelOf } from './query-where.ts'
import type { FieldInfo, ModelInfo } from './schema.ts'
import type { QueryScope } from './scope.ts'
import { planned } from './scope.ts'
import type { Updating } from './relation-write.ts'
import { manyWrite, oneWrite } from './relation-write.ts'
import type { Draft } from './write-data.ts'
import { invalid, readData } from './write-data.ts'
import type { Reads } from './write-plan.ts'

type At = readonly (string | number)[]

type Relation = Extract<FieldInfo, { readonly kind: 'one' | 'many' }>

/** The row whose relation is written, and where its data sits (D-128). */
export type Resolving = {
	readonly scope: QueryScope
	readonly reads: Reads
	readonly model: ModelInfo
	readonly id: string
	readonly creating: boolean
	/** A default's or a hook's value, which skips access rules (D-67). */
	readonly trusted: boolean
	readonly at: At
}

/** The locked row each resolved `update` data or `delete` reaches. */
const rows = new WeakMap<object, Row>()

/** Where a `connectOrCreate`'s create sits in the write's data. */
const origins = new WeakMap<object, At>()

/** A `one` relation write, resolved. */
export type One =
	| { readonly kind: 'connect'; readonly id: string }
	| { readonly kind: 'create'; readonly data: Draft; readonly at: At }
	| { readonly kind: 'update'; readonly data: Draft; readonly row: Row }
	| { readonly kind: 'delete'; readonly row: Row }
	| { readonly kind: 'disconnect' }

/** A `many` relation write, resolved. */
export type Many = {
	readonly connect: readonly string[]
	readonly disconnect: readonly string[]
	readonly create: readonly { readonly data: Draft; readonly at: At }[]
	readonly update: readonly { readonly data: Draft; readonly row: Row }[]
	readonly delete: readonly { readonly row: Row; readonly path: string }[]
}

const nesting = ['set', 'connectOrCreate', 'update', 'delete']

/** Whether a relation value of `draft` needs resolving or reaches a row. */
export const nests = (model: ModelInfo, draft: Draft): boolean =>
	Object.entries(draft).some(([name, value]) => {
		const kind = model.fields.get(name)?.kind
		return (
			(kind === 'one' || kind === 'many') &&
			isObject(value) &&
			nesting.some((key) => Object.hasOwn(value, key))
		)
	})

/** The rows of the other side linked to the row written. */
function linked(r: Resolving, field: Relation, target: ModelInfo): Filter {
	const inverse = target.fields.get(field.inverse)
	const parent = { id: { equals: r.id } }
	return {
		[field.inverse]:
			inverse?.kind === 'many' ? { some: parent } : { is: parent },
	}
}

/** The linked row `where` names, as the caller may `operation` it. */
async function reached(
	r: Resolving,
	field: Relation,
	where: Filter | undefined,
	path: string,
	operation: 'update' | 'delete',
): Promise<Row> {
	const target = modelOf(r.scope.models, field.target)
	const filter = await r.scope.filter(target.name, r.trusted, operation)
	const [row] = await r.reads.find({
		model: target.name,
		where: and(and(linked(r, field, target), where), filter),
		take: 1,
		lock: true,
	})
	if (row === undefined) {
		throw new PublicError('NOT_FOUND', `No ${target.name} matches ${path}.`)
	}
	return row
}

/** A unique `where`, its fields' rules applied unless the value is trusted. */
async function unique(
	r: Resolving,
	target: ModelInfo,
	where: unknown,
	path: string,
): Promise<Filter> {
	const scope = r.trusted ? undefined : r.scope
	return planned(r.scope, () =>
		uniqueWhere(r.scope.models, target, where, path, scope),
	)
}

/**
 * A nested update's data on its locked row: its shape checked again, as a
 * hook may have written it, and its number updates computed (D-132).
 */
function updated(
	r: Resolving,
	field: Relation,
	target: ModelInfo,
	data: Draft,
	row: Row,
	at: At,
): Draft {
	const path = ['data', ...at].join('.')
	const draft = readData(
		r.scope.models,
		target,
		data,
		false,
		path,
		field.inverse,
	)
	computeOn(target, row, draft, operationsOf(target, draft, at))
	rows.set(draft, row)
	return draft
}

/** The row a `connectOrCreate` finds as stored, without rules (D-138). */
async function found(
	r: Resolving,
	target: ModelInfo,
	where: unknown,
	path: string,
): Promise<string | undefined> {
	const filter = uniqueWhere(r.scope.models, target, where, path)
	const [row] = await r.reads.find({
		model: target.name,
		where: filter,
		take: 1,
		lock: true,
	})
	return row?.id
}

export async function resolveOne(
	r: Resolving,
	field: Extract<FieldInfo, { readonly kind: 'one' }>,
	value: unknown,
): Promise<One> {
	const name = field.name
	const path = ['data', ...r.at, name].join('.')
	const write = oneWrite(value, path, r.model.name, r.creating)
	const target = modelOf(r.scope.models, field.target)
	if (write.kind === 'connect' || write.kind === 'disconnect') return write
	if (write.kind === 'create') {
		const at = origins.get(write.data) ?? [...r.at, name, 'create']
		return { kind: 'create', data: write.data, at }
	}
	if (write.kind === 'connectOrCreate') {
		const id = await found(
			r,
			target,
			write.where,
			`${path}.connectOrCreate.where`,
		)
		if (id !== undefined) return { kind: 'connect', id }
		const at = [...r.at, name, 'connectOrCreate', 'create']
		origins.set(write.create, at)
		return { kind: 'create', data: write.create, at }
	}
	if (write.kind === 'update') {
		const known = rows.get(write.data)
		if (known !== undefined) return { ...write, row: known }
		const row = await reached(r, field, undefined, `${path}.update`, 'update')
		const at = [...r.at, name, 'update']
		return {
			kind: 'update',
			data: updated(r, field, target, write.data, row, at),
			row,
		}
	}
	// Refused as `disconnect` is, before any row is read.
	if (field.stored && !field.optional) {
		throw invalid([{ path: [...r.at, name], message: 'Required.' }])
	}
	const known = isObject(value) ? rows.get(value) : undefined
	if (known !== undefined) return { kind: 'delete', row: known }
	const row = await reached(r, field, undefined, `${path}.delete`, 'delete')
	return { kind: 'delete', row }
}

/** The linked rows `update` and `delete` name, each once (D-138). */
async function changing(
	r: Resolving,
	field: Relation,
	target: ModelInfo,
	given: {
		readonly update: readonly Updating[]
		readonly delete: readonly unknown[]
	},
	path: string,
): Promise<Pick<Many, 'update' | 'delete'>> {
	const update: { data: Draft; row: Row }[] = []
	for (const [index, { where, data }] of given.update.entries()) {
		const at = `${path}.update.${index}`
		const known = rows.get(data)
		if (known !== undefined) {
			update.push({ data, row: known })
			continue
		}
		const filter = await unique(r, target, where, `${at}.where`)
		const row = await reached(r, field, filter, `${at}.where`, 'update')
		const draft = updated(r, field, target, data, row, [
			...r.at,
			field.name,
			'update',
			index,
			'data',
		])
		update.push({ data: draft, row })
	}
	const deleted: { row: Row; path: string }[] = []
	for (const [index, where] of given.delete.entries()) {
		const at = `${path}.delete.${index}`
		const known = isObject(where) ? rows.get(where) : undefined
		if (known !== undefined) {
			deleted.push({ row: known, path: at })
			continue
		}
		const filter = await unique(r, target, where, at)
		deleted.push({
			row: await reached(r, field, filter, at, 'delete'),
			path: at,
		})
	}
	return { update, delete: deleted }
}

/** `set` as the links it changes, from the linked rows the caller reads. */
async function setting(
	r: Resolving,
	field: Relation,
	target: ModelInfo,
	set: readonly string[],
	leaving: ReadonlySet<string>,
): Promise<Pick<Many, 'connect' | 'disconnect'>> {
	const inverse = target.fields.get(field.inverse)
	if (inverse?.kind === 'one' && !inverse.optional) {
		throw invalid([
			{
				path: [...r.at, field.name, 'set'],
				message: `A ${target.name} cannot be left without its ${field.inverse}.`,
			},
		])
	}
	const filter = await r.scope.filter(target.name, r.trusted)
	const current = await r.reads.find({
		model: target.name,
		where: and(linked(r, field, target), filter),
		lock: true,
	})
	const kept = new Set(set)
	const ids = new Set(current.map((row) => row.id))
	return {
		connect: [...kept].filter((id) => !ids.has(id)),
		disconnect: [...ids].filter((id) => !kept.has(id) && !leaving.has(id)),
	}
}

/** Fails when a row is named by two operations of the relation (D-138). */
function once(many: Many, path: string): void {
	const seen = new Set<string>()
	const links = new Set([...many.connect, ...many.disconnect])
	const named = [
		...many.update.map(({ row }) => row.id),
		...many.delete.map(({ row }) => row.id),
	]
	for (const id of named) {
		if (seen.has(id) || links.has(id)) {
			throw new InvalidQuery(path, `${path} names the same row twice.`)
		}
		seen.add(id)
	}
}

export async function resolveMany(
	r: Resolving,
	field: Extract<FieldInfo, { readonly kind: 'many' }>,
	value: unknown,
): Promise<Many> {
	const path = ['data', ...r.at, field.name].join('.')
	const write = manyWrite(value, path, r.model.name, r.creating)
	const target = modelOf(r.scope.models, field.target)
	const { update, delete: deleted } = await changing(
		r,
		field,
		target,
		write,
		path,
	)
	const connect = [...write.connect]
	const disconnect = [...write.disconnect]
	if (write.set !== undefined) {
		const leaving = new Set(deleted.map(({ row }) => row.id))
		const links = await setting(r, field, target, write.set, leaving)
		connect.push(...links.connect)
		disconnect.push(...links.disconnect)
	}
	const create = write.create.map((data, index) => ({
		data,
		at: origins.get(data) ?? [...r.at, field.name, 'create', index],
	}))
	for (const [index, item] of write.connectOrCreate.entries()) {
		const at = `${path}.connectOrCreate.${index}`
		const id = await found(r, target, item.where, `${at}.where`)
		if (id !== undefined) {
			connect.push(id)
			continue
		}
		const origin = [...r.at, field.name, 'connectOrCreate', index, 'create']
		origins.set(item.create, origin)
		create.push({ data: item.create, at: origin })
	}
	const many = { connect, disconnect, create, update, delete: deleted }
	once(many, path)
	return many
}

/** A resolved `one` as the relation value hooks and rules see. */
function oneValue(one: One): unknown {
	if (one.kind === 'connect') return { connect: { id: one.id } }
	if (one.kind === 'create') return { create: one.data }
	if (one.kind === 'update') return { update: one.data }
	if (one.kind === 'disconnect') return { disconnect: true }
	const value = { delete: true }
	rows.set(value, one.row)
	return value
}

const ref = (id: string) => ({ id })

/** A resolved `many` as the relation value hooks and rules see. */
function manyValue(many: Many): Draft {
	const value: Draft = {}
	if (many.connect.length > 0) value['connect'] = many.connect.map(ref)
	if (many.disconnect.length > 0) value['disconnect'] = many.disconnect.map(ref)
	if (many.create.length > 0) {
		value['create'] = many.create.map(({ data }) => data)
	}
	if (many.update.length > 0) {
		value['update'] = many.update.map(({ data, row }) => ({
			where: { id: row.id },
			data,
		}))
	}
	if (many.delete.length > 0) {
		value['delete'] = many.delete.map(({ row }) => {
			const where = { id: row.id }
			rows.set(where, row)
			return where
		})
	}
	return value
}

/** Resolves each relation value of `draft` in place, before the rules. */
export async function resolveData(r: Resolving, draft: Draft): Promise<void> {
	for (const [name, value] of Object.entries(draft)) {
		const field = r.model.fields.get(name)
		if (field?.kind === 'one') {
			draft[name] = oneValue(await resolveOne(r, field, value))
		} else if (field?.kind === 'many') {
			draft[name] = manyValue(await resolveMany(r, field, value))
		}
	}
}
