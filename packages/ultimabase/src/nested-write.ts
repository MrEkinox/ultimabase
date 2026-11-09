// A relation write's `set`, `connectOrCreate`, `update` and `delete`,
// resolved before the rules see it (D-138): the linked rows each one reaches,
// read locked, and `set` and `connectOrCreate` as the links they stand for.
import { and } from './access.ts'
import type { Row } from './adapter.ts'
import {
	found,
	foundIds,
	linked,
	missing,
	reached,
	reachedAll,
} from './nested-rows.ts'
import { computeOn, operationsOf } from './number-update.ts'
import { isObject, modelOf } from './query-where.ts'
import type { FieldInfo, ModelInfo } from './schema.ts'
import type { QueryScope } from './scope.ts'
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
	const known = held(value)
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

/** The row a hook's `delete` item already holds (D-128). */
const held = (where: unknown): Row | undefined =>
	isObject(where) ? rows.get(where) : undefined

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
	const at = (index: number): string => `${path}.update.${index}.where`
	const updating = await reachedAll(
		r,
		field,
		target,
		given.update.map(({ where, data }, index) =>
			rows.has(data) ? undefined : { where, path: at(index) },
		),
		'update',
	)
	const update = given.update.map(({ data }, index) => {
		const known = rows.get(data)
		if (known !== undefined) return { data, row: known }
		const row = updating[index]
		if (row === undefined) throw missing(target, at(index))
		const to = [...r.at, field.name, 'update', index, 'data']
		return { data: updated(r, field, target, data, row, to), row }
	})
	const deleting = await reachedAll(
		r,
		field,
		target,
		given.delete.map((where, index) =>
			held(where) ? undefined : { where, path: `${path}.delete.${index}` },
		),
		'delete',
	)
	const deleted = given.delete.map((where, index) => {
		const row = held(where) ?? deleting[index]
		if (row === undefined) throw missing(target, `${path}.delete.${index}`)
		return { row, path: `${path}.delete.${index}` }
	})
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
		lock: 'update',
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
	const existing = await foundIds(
		r,
		target,
		write.connectOrCreate.map(({ where }, index) => ({
			where,
			path: `${path}.connectOrCreate.${index}.where`,
		})),
	)
	for (const [index, item] of write.connectOrCreate.entries()) {
		const id = existing[index]
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
