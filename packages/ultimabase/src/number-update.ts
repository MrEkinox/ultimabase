// Number updates (D-132): `{ set }`, `{ increment }`, `{ decrement }`,
// `{ multiply }` or `{ divide }` on a number field, computed on the row as
// the write finds it.
import type { Arithmetic } from './adapter.ts'
import { OutOfRange } from './adapter.ts'
import { InvalidQuery } from './errors.ts'
import { isObject } from './query-where.ts'
import type { FieldInfo, ModelInfo } from './schema.ts'
import type { Draft } from './write-data.ts'
import { invalid, issueOf } from './write-data.ts'

const operations = [
	'set',
	'increment',
	'decrement',
	'multiply',
	'divide',
] as const
type Operation = (typeof operations)[number]

const isOperation = (key: unknown): key is Operation =>
	operations.some((operation) => operation === key)

/** The number updates an update computes on its row, by field. */
export type Numbers = ReadonlyMap<string, Arithmetic>

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
export function numberUpdates(model: ModelInfo, draft: Draft): Numbers {
	const numbers = new Map<string, Arithmetic>()
	for (const [name, value] of Object.entries(draft)) {
		const field = model.fields.get(name)
		if (!operable(field) || !isObject(value)) continue
		// `undefined` is no operation (D-84); one by `undefined` changes nothing.
		const keys = Object.keys(value)
		const used = operations.filter((key) => value[key] !== undefined)
		if (keys.length === 0 || used.length > 1 || !keys.every(isOperation)) {
			const path = `data.${name}`
			throw new InvalidQuery(
				path,
				`${path} takes a number or one of ${operations.join(', ')}.`,
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
		if (issue !== undefined) throw invalid([{ path: [name], message: issue }])
		numbers.set(name, { operation, by: Number(by) })
	}
	return numbers
}

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
export function validates(model: ModelInfo, numbers: Numbers): boolean {
	return [...numbers.keys()].some(
		(name) => model.fields.get(name)?.options['validate'] !== undefined,
	)
}

/** Writes each computed number into the draft, from the locked `row`. */
export function computeOn(
	model: ModelInfo,
	row: { readonly [field: string]: unknown },
	draft: Draft,
	numbers: Numbers,
): void {
	for (const [name, arithmetic] of numbers) {
		const field = model.fields.get(name)
		const integer = field?.kind === 'scalar' && field.integer === true
		draft[name] = computed(row[name], arithmetic, integer)
	}
}

/** A result the write refused, worded as the kernel's own check (D-132). */
export function outOfRange(model: ModelInfo, error: unknown): unknown {
	if (!(error instanceof OutOfRange)) return error
	const field = model.fields.get(error.field)
	const issue = field?.kind === 'scalar' ? issueOf(Infinity, field) : undefined
	return invalid([{ path: [error.field], message: issue ?? error.message }])
}
