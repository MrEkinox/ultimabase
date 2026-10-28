// Number updates (D-132): `{ set }`, `{ increment }`, `{ decrement }`,
// `{ multiply }` or `{ divide }` on a number field, computed on the row as
// the write finds it, as a list update is (D-149).
import type { Arithmetic, ListUpdate } from './adapter.ts'
import { OutOfRange } from './adapter.ts'
import { InvalidQuery } from './errors.ts'
import { listed, listUpdates } from './list-update.ts'
import { isObject } from './query-where.ts'
import type { FieldInfo, ModelInfo } from './schema.ts'
import type { Draft } from './write-data.ts'
import { invalid, issueOf } from './write-data.ts'

const arithmetic = [
	'set',
	'increment',
	'decrement',
	'multiply',
	'divide',
] as const
type Operation = (typeof arithmetic)[number]

const isOperation = (key: unknown): key is Operation =>
	arithmetic.some((operation) => operation === key)

/** The number and list updates an update computes on its row, by field. */
export type Operations = ReadonlyMap<string, Arithmetic | ListUpdate>

type Scalar = Extract<FieldInfo, { readonly kind: 'scalar' }>

/** A number field written as a value or an operation: no list, no codec. */
const operable = (field: FieldInfo | undefined): field is Scalar =>
	field?.kind === 'scalar' &&
	field.type === 'number' &&
	!field.list &&
	field.codec === undefined

/**
 * Takes the operations out of an update's draft: `{ set: x }` becomes `x`,
 * an operation by `undefined` leaves its field as it is (D-84), and each
 * other one comes back to be computed on the row.
 */
function numberUpdates(
	model: ModelInfo,
	draft: Draft,
	at: readonly (string | number)[] = [],
): Map<string, Arithmetic> {
	const numbers = new Map<string, Arithmetic>()
	for (const [name, value] of Object.entries(draft)) {
		const field = model.fields.get(name)
		if (!operable(field) || !isObject(value)) continue
		// `undefined` is no operation (D-84); one by `undefined` changes nothing.
		const keys = Object.keys(value)
		const used = arithmetic.filter((key) => value[key] !== undefined)
		if (keys.length === 0 || used.length > 1 || !keys.every(isOperation)) {
			const path = ['data', ...at, name].join('.')
			throw new InvalidQuery(
				path,
				`${path} takes a number or one of ${arithmetic.join(', ')}.`,
			)
		}
		delete draft[name]
		const [operation] = used
		if (operation === undefined) continue
		const by = value[operation]
		if (operation === 'set') {
			draft[name] = by
			continue
		}
		const issue =
			issueOf(by, field) ??
			(operation === 'divide' && by === 0 ? 'Cannot divide by 0.' : undefined)
		if (issue !== undefined)
			throw invalid([{ path: [...at, name], message: issue }])
		numbers.set(name, { operation, by: Number(by) })
	}
	return numbers
}

/** Takes an update's number and list operations out of its draft. */
export const operationsOf = (
	model: ModelInfo,
	draft: Draft,
	at: readonly (string | number)[] = [],
): Operations =>
	new Map<string, Arithmetic | ListUpdate>([
		...numberUpdates(model, draft, at),
		...listUpdates(model, draft, at),
	])

/** An update's result on `current`, `null` counting as 0. */
export function computed(
	current: unknown,
	{ operation, by }: Arithmetic,
	integer: boolean,
): number {
	const from = typeof current === 'number' ? current : 0
	if (operation === 'increment') return from + by
	if (operation === 'decrement') return from - by
	if (operation === 'multiply') return from * by
	return integer ? Math.trunc(from / by) : from / by
}

/** Whether the row must be read first: a field's `validate` sees the result. */
export function validates(model: ModelInfo, operations: Operations): boolean {
	return [...operations.keys()].some(
		(name) => model.fields.get(name)?.options['validate'] !== undefined,
	)
}

/** Writes each computed number and list into the draft, from the locked `row`. */
export function computeOn(
	model: ModelInfo,
	row: { readonly [field: string]: unknown },
	draft: Draft,
	operations: Operations,
): void {
	for (const [name, operation] of operations) {
		const field = model.fields.get(name)
		const integer = field?.kind === 'scalar' && field.integer === true
		draft[name] =
			'elements' in operation
				? listed(row[name], operation)
				: computed(row[name], operation, integer)
	}
}

/** A result the write refused, worded as the kernel's own check (D-132). */
function outOfRange(model: ModelInfo, error: unknown): unknown {
	if (!(error instanceof OutOfRange)) return error
	const field = model.fields.get(error.field)
	const issue = field?.kind === 'scalar' ? issueOf(Infinity, field) : undefined
	return invalid([{ path: [error.field], message: issue ?? error.message }])
}

/** `run`, a result it computed out of range refused as `outOfRange` words it. */
export const inRange = async <T>(
	model: ModelInfo,
	run: Promise<T>,
): Promise<T> =>
	run.catch((error: unknown) => {
		throw outOfRange(model, error)
	})
