// A relation write's `set`, `connectOrCreate`, `update` and `delete`,
// resolved before the rules see it (D-138): the linked rows each one reaches,
// read locked, and `set` and `connectOrCreate` as the links they stand for.
import { and } from './access.ts'
import type { Filter, Row } from './adapter.ts'
import { PublicError } from './errors.ts'
import { computeOn, operationsOf } from './number-update.ts'
import { uniqueWhere } from './query-args.ts'
import { isObject, modelOf } from './query-where.ts'
import type { FieldInfo, ModelInfo } from './schema.ts'
import type { QueryScope } from './scope.ts'
import { planned } from './scope.ts'
import type { Updating } from './relation-write.ts'
import type { OneOfInfo } from './one-of-schema.ts'
import { declaredName } from './one-of-schema.ts'
import { manyWrite, once, oneOfWrite, oneWrite } from './relation-write.ts'
import type { Draft } from './write-data.ts'
import { invalid, readData } from './write-data.ts'
import type { Reads } from './write-plan.ts'
import { required } from './write-context.ts'
import type { At, Many, One } from './nested-value.ts'
import { manyValue, oneValue, origins, rows } from './nested-value.ts'

export type { Many, One } from './nested-value.ts'

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

const nesting = ['set', 'connectOrCreate', 'update', 'delete']

/** Whether a relation value of `draft` needs resolving or reaches a row. */
export const nests = (model: ModelInfo, draft: Draft): boolean =>
	Object.entries(draft).some(([name, value]) => {
		const kind = model.oneOfs.has(name) ? 'one' : model.fields.get(name)?.kind
		return (
			(kind === 'one' || kind === 'many') &&
			isObject(value) &&
			nesting.some((key) => Object.hasOwn(value, key))
		)
	})

/** The rows of the other side linked to the row written. */
async function linked(
	r: Resolving,
	field: Relation,
	target: ModelInfo,
): Promise<Filter> {
	const parent = { id: { equals: r.id } }
	if (field.inverse === undefined) {
		// No other side (D-237): the key the row stores names the linked row.
		const read = { model: r.model.name, where: parent, fields: [field.name] }
		const key = (await r.reads.find({ ...read, take: 1 }))[0]?.[field.name]
		return { id: { in: isObject(key) ? [key['id']] : [] } }
	}
	const inverse = target.fields.get(field.inverse)
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
		where: and(and(await linked(r, field, target), where), filter),
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

/**
 * A `oneOf` value resolved (D-247): its kind's hidden `one` and the value it
 * takes, a `connectOrCreate` found or made a `create`; `undefined` for
 * `disconnect`.
 */
export async function resolveOneOf(
	r: Resolving,
	info: OneOfInfo,
	value: unknown,
): Promise<
	| {
			readonly kind: string
			readonly field: string
			readonly operation: 'connect' | 'create'
			readonly operand: Draft
	  }
	| undefined
> {
	const path = ['data', ...r.at, info.name].join('.')
	const named = oneOfWrite(value, path, info, r.creating)
	if (named === undefined) return undefined
	const { kind, field, target, write } = named
	if (write.kind === 'connect') {
		return { kind, field, operation: 'connect', operand: { id: write.id } }
	}
	const at = [...r.at, info.name, write.kind, kind]
	if (write.kind === 'create') {
		if (!origins.has(write.data)) origins.set(write.data, at)
		return { kind, field, operation: 'create', operand: write.data }
	}
	const model = modelOf(r.scope.models, target)
	const where = `${['data', ...at].join('.')}.where`
	const id = await found(r, model, write.where, where)
	if (id !== undefined) {
		return { kind, field, operation: 'connect', operand: { id } }
	}
	origins.set(write.create, [...at, 'create'])
	return { kind, field, operation: 'create', operand: write.create }
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
	field: Extract<FieldInfo, { readonly kind: 'many' }>,
	target: ModelInfo,
	set: readonly string[],
	leaving: ReadonlySet<string>,
): Promise<Pick<Many, 'connect' | 'disconnect'>> {
	const inverse = target.fields.get(field.inverse)
	if (inverse?.kind === 'one' && required(inverse)) {
		throw invalid([
			{
				path: [...r.at, field.name, 'set'],
				message: `A ${target.name} cannot be left without its ${declaredName(target, field.inverse)}.`,
			},
		])
	}
	const filter = await r.scope.filter(target.name, r.trusted)
	const current = await r.reads.find({
		model: target.name,
		where: and(await linked(r, field, target), filter),
		lock: true,
	})
	const kept = new Set(set)
	const ids = new Set(current.map((row) => row.id))
	return {
		connect: [...kept].filter((id) => !ids.has(id)),
		disconnect: [...ids].filter((id) => !kept.has(id) && !leaving.has(id)),
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
		// A spread of 120000 items or more into a call overflows the stack.
		for (const id of links.connect) connect.push(id)
		for (const id of links.disconnect) disconnect.push(id)
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

/** Resolves each relation value of `draft` in place, before the rules. */
export async function resolveData(r: Resolving, draft: Draft): Promise<void> {
	for (const [name, value] of Object.entries(draft)) {
		const field = r.model.fields.get(name)
		const oneOf = r.model.oneOfs.get(name)
		if (oneOf !== undefined) {
			const one = await resolveOneOf(r, oneOf, value)
			draft[name] =
				one === undefined
					? { disconnect: true }
					: { [one.operation]: { [one.kind]: one.operand } }
		} else if (field?.kind === 'one') {
			draft[name] = oneValue(await resolveOne(r, field, value))
		} else if (field?.kind === 'many') {
			draft[name] = manyValue(await resolveMany(r, field, value))
		}
	}
}
