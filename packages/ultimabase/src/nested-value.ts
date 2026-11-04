// A relation write resolved (D-138): its operations by row, the value hooks
// and rules see, and the rows and places its values stand for.
import type { Row } from './adapter.ts'
import type { Draft } from './write-data.ts'

export type At = readonly (string | number)[]

/** The locked row each resolved `update` data or `delete` reaches. */
export const rows = new WeakMap<object, Row>()

/** Where a `connectOrCreate`'s create sits in the write's data. */
export const origins = new WeakMap<object, At>()

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

/** A resolved `one` as the relation value hooks and rules see. */
export function oneValue(one: One): unknown {
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
export function manyValue(many: Many): Draft {
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
