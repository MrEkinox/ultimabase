// What a live read asks for (D-154): `first` and `totalCount` are the
// engine's own; the rest is planned as a `findMany`'s, with each level's
// `id` selected, which places and tracks the rows it reaches.
import { PublicError } from 'ultimabase'

type Args = { readonly [key: string]: unknown }

const isArgs = (value: unknown): value is Args =>
	typeof value === 'object' && value !== null && !Array.isArray(value)

const invalid = (path: string, message: string): PublicError =>
	new PublicError('VALIDATION_FAILED', message, {
		details: { issues: [{ path: [path], message }] },
	})

/** `nested`, a relation's value in a selection, with its rows' `id`. */
const nestedWithIds = (nested: unknown): unknown =>
	isArgs(nested) ? withIds(nested) : nested

/** `args`' selection, each level's `id` selected and never omitted. */
function withIds(args: Args): Args {
	const { select, include, omit, ...rest } = args
	const out: { [key: string]: unknown } = { ...rest }
	if (isArgs(select)) {
		const fields = Object.entries(select).map(([field, value]) => [
			field,
			field === '_count' ? value : nestedWithIds(value),
		])
		out['select'] = { ...Object.fromEntries(fields), id: true }
	} else if (select !== undefined) out['select'] = select
	if (isArgs(include)) {
		const fields = Object.entries(include).map(([field, value]) => [
			field,
			field === '_count' ? value : nestedWithIds(value),
		])
		out['include'] = Object.fromEntries(fields)
	} else if (include !== undefined) out['include'] = include
	if (isArgs(omit)) {
		out['omit'] = Object.fromEntries(
			Object.entries(omit).filter(([field]) => field !== 'id'),
		)
	} else if (omit !== undefined) out['omit'] = omit
	return out
}

/** What `livePlan` reads: `args` without the engine's own keys. */
export function liveArgs(args: unknown, row: boolean): unknown {
	if (!isArgs(args)) return args
	if (row) return withIds(args)
	const { first: _first, totalCount: _totalCount, ...rest } = args
	return withIds(rest)
}

export type Shape = {
	readonly first: number
	readonly where: unknown
	readonly totalCount: boolean
	/** The selection each window row is read with. */
	readonly shape: Args
}

/** `args`' window and selection; a list's `first` is a positive integer. */
export function shapeOf(args: unknown, row: boolean): Shape {
	const read = isArgs(args) ? args : {}
	const { where, first, totalCount } = read
	if (
		!row &&
		(!Number.isInteger(first) || typeof first !== 'number' || first < 1)
	) {
		throw invalid('first', 'first must be a positive integer.')
	}
	if (!row && totalCount !== undefined && typeof totalCount !== 'boolean') {
		throw invalid('totalCount', 'totalCount must be a boolean.')
	}
	const { select, include, omit } = withIds(read)
	return {
		first: typeof first === 'number' && !row ? first : 1,
		where,
		totalCount: !row && totalCount === true,
		shape: {
			...(select !== undefined && { select }),
			...(include !== undefined && { include }),
			...(omit !== undefined && { omit }),
		},
	}
}
