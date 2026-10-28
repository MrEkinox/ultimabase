// The adapter contract suite (D-02, D-73, D-94): what every adapter does
// alike, checked through the kernel's public API.
import type { Adapter } from 'ultimabase'
import { describe } from 'vitest'
import { aggregates } from './aggregates.ts'
import { cases } from './cases.ts'
import { cascades } from './cascades.ts'
import { counts } from './counts.ts'
import { decimals } from './decimals.ts'
import { groups } from './groups.ts'
import { lists } from './lists.ts'
import { nested } from './nested.ts'
import { numbers } from './numbers.ts'
import { projection } from './projection.ts'
import { reads } from './reads.ts'
import { roundTrips } from './round-trips.ts'
import { transactions } from './transactions.ts'
import { writes } from './writes.ts'

export type Options = {
	/** How many round trips the adapters have made so far, BEGIN and COMMIT included (D-98). */
	readonly roundTrips: () => number
}

/**
 * Runs the contract against the adapters `create` returns, one per test, each
 * on an empty database.
 */
export function testAdapter(
	name: string,
	create: () => Adapter,
	options: Options,
): void {
	describe(`the ${name} adapter`, () => {
		reads(create)
		cases(create)
		writes(create)
		cascades(create)
		lists(create)
		nested(create)
		numbers(create)
		decimals(create)
		counts(create)
		aggregates(create)
		groups(create)
		projection(create)
		transactions(create)
		roundTrips(create, options.roundTrips)
	})
}
