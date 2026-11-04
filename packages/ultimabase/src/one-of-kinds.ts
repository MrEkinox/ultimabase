// The kinds `f.oneOf` takes (D-247): each a thunk of its model.
import { isObject } from './query-where.ts'

/** A kind's name a `where` reads as its own key (D-247). */
const filterKeys = new Set(['kind', 'is', 'isNot'])

export function kindsOf(targets: unknown): ReadonlyMap<string, () => unknown> {
	if (!isObject(targets)) {
		throw new Error('f.oneOf() takes an object of kinds.')
	}
	const kinds = new Map<string, () => unknown>()
	for (const [kind, target] of Object.entries(targets)) {
		if (filterKeys.has(kind)) {
			throw new Error(`f.oneOf(): ${kind} is a filter's key, not a kind.`)
		}
		if (typeof target !== 'function') {
			throw new Error(`f.oneOf(): ${kind} takes a thunk of its model.`)
		}
		kinds.set(kind, () => Reflect.apply(target, undefined, []))
	}
	if (kinds.size < 2) throw new Error('f.oneOf() takes two kinds or more.')
	return kinds
}
