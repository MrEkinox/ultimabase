// The checks every catalog definition shares: its keys, and the names it
// gives. A product's key and a price's name make the price's lookup key,
// `<product>.<price>`, so neither holds a dot.
import { Refused } from 'ultimabase'

const named = /^[\w-]+$/u

/** Where a message points: `defineProduct(pro)`, or the entry alone. */
export const whereOf = (entry: string, definition: object): string => {
	const key: unknown = Reflect.get(definition, 'key')
	return typeof key === 'string' ? `${entry}(${key})` : entry
}

/**
 * Refuses a definition that is not an object, or holds a key `keys` does
 * not name: a misspelt option would be dropped unread (D-370).
 */
export function ownKeys(
	entry: string,
	definition: unknown,
	keys: readonly string[],
): asserts definition is object {
	if (typeof definition !== 'object' || definition === null) {
		throw new Refused(`${entry} takes an object.`)
	}
	for (const key of Object.keys(definition)) {
		if (!keys.includes(key)) {
			throw new Refused(`${whereOf(entry, definition)} takes no ${key}.`)
		}
	}
}

/** Refuses a key or a price's name that is not letters, digits, - and _. */
export function checkKey(where: string, key: unknown): void {
	if (typeof key !== 'string' || !named.test(key)) {
		throw new Refused(
			`${where}: ${JSON.stringify(key)} is not a key: letters, digits, - and _ only.`,
		)
	}
}
