// A `oneOf` over REST (D-247), as GraphQL's: read as its kind and each kind
// it asks for, filtered by kind, by a kind and by the fields the kinds share,
// written as one kind's `connect`, `connectOrCreate` or `create`.
import type { ServedOneOf } from '@ultimabase/http/internal'
import { InvalidQuery } from 'ultimabase'
import type { Args } from './entries.ts'
import type { Read } from './fields.ts'
import type { Out } from './shapes.ts'
import { isArgs, unknownKey } from './values.ts'

/**
 * `true` reads each kind as `include` does, an object the kinds it names,
 * each `true` or its `select` or `include`, as a `one`'s.
 */
export function oneOfRead(
	model: string,
	oneOf: ServedOneOf,
	value: unknown,
	path: string,
	nested: (target: string, args: Args, path: string) => Read,
): { readonly read: Args; readonly field: Out } {
	const all = Object.fromEntries(oneOf.kinds.map(({ kind }) => [kind, true]))
	const given = value === true ? all : value
	if (!isArgs(given)) {
		throw new InvalidQuery(path, `${path} must be true or an object.`)
	}
	const read: { [kind: string]: unknown } = {}
	const kinds: { kind: string; shape: Read['shape'] }[] = []
	for (const [kind, asked] of Object.entries(given)) {
		const at = `${path}.${kind}`
		const found = oneOf.kinds.find((each) => each.kind === kind)
		if (found === undefined) throw unknownKey(at, model)
		if (asked === false) continue
		const args = asked === true ? {} : asked
		if (!isArgs(args)) {
			throw new InvalidQuery(at, `${at} must be true or an object.`)
		}
		for (const key of Object.keys(args)) {
			if (key !== 'select' && key !== 'include') {
				throw unknownKey(`${at}.${key}`, model)
			}
		}
		const target = nested(found.field.target, args, at)
		read[kind] = target.read
		kinds.push({ kind, shape: target.shape })
	}
	return { read, field: { kind: 'oneOf', name: oneOf.name, kinds } }
}
