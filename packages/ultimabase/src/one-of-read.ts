// A `oneOf` in a read (D-247): `true` reads each kind's scalars, an object
// of kinds shapes each as a `one`; a kind left out reads its id only, which
// says the kind. A row reads `{ kind, [kind]: row }`, or `null` when no kind
// is set or the target is a row the caller cannot read.
import { InvalidQuery } from './errors.ts'
import type { OneOfInfo } from './one-of-schema.ts'
import { entries, isObject, unknownKey } from './query-where.ts'

type Values = { readonly [field: string]: unknown }

/**
 * The kinds a read of a `oneOf` shows; each hidden `one` read by `related`
 * with its args.
 */
export function oneOfArgs(
	model: string,
	info: OneOfInfo,
	value: unknown,
	path: string,
	related: (field: string, args: unknown, path: string) => void,
): ReadonlySet<string> {
	const chosen = new Map<string, unknown>()
	if (value === true) {
		for (const kind of info.kinds.keys()) chosen.set(kind, true)
	} else {
		for (const [kind, given] of entries(value, path)) {
			const at = `${path}.${kind}`
			if (!info.kinds.has(kind)) throw unknownKey(at, model)
			if (typeof given !== 'boolean' && !isObject(given)) {
				throw new InvalidQuery(at, `${at} must be a boolean or an object.`)
			}
			if (given !== false) chosen.set(kind, given)
		}
	}
	for (const [kind, { field }] of info.kinds) {
		const given = chosen.get(kind)
		const args =
			given === undefined
				? { select: { id: true } }
				: given === true
					? undefined
					: given
		related(field, args, `${path}.${kind}`)
	}
	return new Set(chosen.keys())
}

/** A row's `oneOf` as it reads: its kind, the target if shown, or `null`. */
export function folded(
	info: OneOfInfo,
	shown: ReadonlySet<string>,
	row: Values,
	project: (field: string, target: Values) => unknown,
): unknown {
	for (const [kind, { field }] of info.kinds) {
		const target = row[field]
		if (!isObject(target)) continue
		return shown.has(kind) ? { kind, [kind]: project(field, target) } : { kind }
	}
	return null
}
