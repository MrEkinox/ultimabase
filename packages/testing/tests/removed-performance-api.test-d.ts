import { expectTypeOf, test } from 'vitest'
import type * as testing from '../src/index.js'

test('keeps internal Runtime measurements outside the testing package API', () => {
	expectTypeOf<
		Extract<
			keyof typeof testing,
			| 'RuntimeCostProbe'
			| 'assertNoOptionalRuntimeCost'
			| 'diffRuntimeCostSnapshots'
		>
	>().toEqualTypeOf<never>()
})
// @ts-expect-error Internal cost snapshots are no longer a public testing contract.
type RemovedSnapshot = testing.RuntimeCostSnapshot
// @ts-expect-error Internal probes are no longer configurable public plugins.
type RemovedOptions = testing.RuntimeCostProbeOptions
void (undefined as unknown as RemovedSnapshot)
void (undefined as unknown as RemovedOptions)
