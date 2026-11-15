// A plugin field outside a `beforeFind` (D-404): a `where` filters its
// presence alone, `null` or `{ not: null }`, on its stored column. Its value
// is the plugin's, which only a `beforeFind` filters (D-122).
import type { Codec } from './definition.ts'
import { InvalidQuery } from './errors.ts'
import { entries, isObject } from './query-values.ts'

/**
 * Throws unless `value` is `null` or `{ not: null }` on a single field. A
 * list, the kernel's or one a field type stores itself, as a files list
 * stored as `[]`, is never `null`.
 */
export function checkPresence(
	field: string,
	codec: Codec,
	list: boolean,
	value: unknown,
	at: string,
): void {
	const { plugin } = codec
	if (list || codec.options['list'] === true) {
		throw new InvalidQuery(
			at,
			`${at}: ${field} is a ${plugin} list, never null: only a beforeFind filters it.`,
		)
	}
	if (value === null) return
	if (
		isObject(value) &&
		entries(value, at).every(([key, item]) => key === 'not' && item === null)
	) {
		return
	}
	throw new InvalidQuery(
		at,
		`${at}: ${field} is a ${plugin} field: a where filters its presence alone, null or { not: null }.`,
	)
}
