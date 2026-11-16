// The checks every catalog definition shares: its keys, and the names it
// gives. A product's key and a price's name make the price's lookup key,
// `<product>.<price>`, so neither holds a dot. And Stripe's API keys.
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
	// Only a definition that takes a key is named by it: an option misspelt
	// `key` may hold a secret key, never quoted.
	const where = keys.includes('key') ? whereOf(entry, definition) : entry
	for (const key of Object.keys(definition)) {
		if (!keys.includes(key)) {
			throw new Refused(`${where} takes no ${key}.`)
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

// A secret or restricted key, and its mode (D-406).
const apiKey = /^(?:sk|rk)_(test|live)_/u

/** Refuses what is not a secret or restricted key, `sk_…` or `rk_…`. */
export function checkSecret(
	where: string,
	secret: unknown,
): asserts secret is string {
	if (typeof secret !== 'string' || !apiKey.test(secret)) {
		throw new Refused(`${where} is a secret or restricted key, sk_… or rk_….`)
	}
}

/** Whether a key checked by `checkSecret` reaches the live account. */
export const isLive = (secret: string): boolean =>
	apiKey.exec(secret)?.[1] === 'live'
