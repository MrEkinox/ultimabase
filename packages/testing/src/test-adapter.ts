// The adapter contract suite (D-02, D-73, D-94): what every adapter does
// alike, checked through the kernel's public API.
import type { Adapter } from 'ultimabase'
import { describe } from 'vitest'
import { reads } from './reads.ts'
import { statements } from './statements.ts'
import { transactions } from './transactions.ts'
import { writes } from './writes.ts'

export type Options = {
	/** How many statements the adapters have run so far (D-98). */
	readonly statements: () => number
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
		writes(create)
		transactions(create)
		statements(create, options.statements)
	})
}
