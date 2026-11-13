// `defineCredit` (D-372): a kind of credit, as blue gems. It is a function:
// `blueGems(500)` is 500 of them, a value a product gives and, later, the
// application spends.
import { Refused } from 'ultimabase'
import { checkKey, ownKeys } from './keys.ts'

/** An amount of one credit: what a product gives. */
export interface CreditAmount<K extends string = string> {
	readonly credit: K
	readonly amount: number
}

/** A kind of credit: called with an amount, it gives that many of it. */
export interface Credit<K extends string = string> {
	(amount: number): CreditAmount<K>
	/** The credit's name in the application, never changed. */
	readonly key: K
}

/** Declares a kind of credit (D-372). */
export function defineCredit<const K extends string>(definition: {
	readonly key: K
}): Credit<K> {
	ownKeys('defineCredit', definition, ['key'])
	const { key } = definition
	checkKey('defineCredit', key)
	const credit = (amount: number): CreditAmount<K> => {
		if (!Number.isSafeInteger(amount) || amount <= 0) {
			throw new Refused(
				`${key}(${String(amount)}): an amount is a positive integer.`,
			)
		}
		return Object.freeze({ credit: key, amount })
	}
	return Object.assign(credit, { key })
}
