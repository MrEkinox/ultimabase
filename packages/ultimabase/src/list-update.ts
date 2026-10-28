// List updates (D-149): `{ set }`, `{ push }`, `{ pushUnique }` or
// `{ remove }` on a list field, with an element or a list of them, computed
// on the row as the write finds it, as a number update is (D-132).
import type { ListUpdate } from './adapter.ts'
import { InvalidQuery } from './errors.ts'
import { isObject } from './query-where.ts'
import type { ModelInfo } from './schema.ts'
import type { Draft } from './write-data.ts'
import { invalid, issueOf } from './write-data.ts'

const operations = ['set', 'push', 'pushUnique', 'remove'] as const
type Operation = (typeof operations)[number]

const isOperation = (key: unknown): key is Operation =>
	operations.some((operation) => operation === key)

/**
 * Takes the operations out of an update's draft: `{ set }` becomes its
 * list, an operation by `undefined` leaves its field as it is (D-84), and
 * each other one comes back to be computed on the row.
 */
export function listUpdates(
	model: ModelInfo,
	draft: Draft,
	at: readonly (string | number)[] = [],
): Map<string, ListUpdate> {
	const lists = new Map<string, ListUpdate>()
	for (const [name, value] of Object.entries(draft)) {
		const field = model.fields.get(name)
		// A field type's value is its own, as for numbers (D-132).
		const plain = field?.kind === 'scalar' && field.list && !field.codec
		if (!plain || !isObject(value)) continue
		const keys = Object.keys(value)
		const used = operations.filter((key) => value[key] !== undefined)
		if (keys.length === 0 || used.length > 1 || !keys.every(isOperation)) {
			const path = ['data', ...at, name].join('.')
			throw new InvalidQuery(
				path,
				`${path} takes a list or one of ${operations.join(', ')}.`,
			)
		}
		delete draft[name]
		const [operation] = used
		if (operation === undefined) continue
		const given = value[operation]
		const elements: readonly unknown[] = Array.isArray(given) ? given : [given]
		const issue = issueOf(elements, field)
		if (issue !== undefined) {
			throw invalid([{ path: [...at, name], message: issue }])
		}
		if (operation === 'set') draft[name] = elements
		else lists.set(name, { operation, elements })
	}
	return lists
}

/** A list update's result on `current`, the elements in their order. */
export function listed(
	current: unknown,
	{ operation, elements }: ListUpdate,
): unknown[] {
	const from: readonly unknown[] = Array.isArray(current) ? current : []
	if (operation === 'push') return [...from, ...elements]
	if (operation === 'remove') {
		return from.filter((item) => !elements.includes(item))
	}
	const added = elements.filter(
		(item, index) => !from.includes(item) && elements.indexOf(item) === index,
	)
	return [...from, ...added]
}
