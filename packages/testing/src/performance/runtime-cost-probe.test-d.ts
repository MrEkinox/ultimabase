import {
	RuntimeCostProbe,
	assertNoOptionalRuntimeCost,
	diffRuntimeCostSnapshots,
	type RuntimeCostSnapshot,
} from '@ultimabase/testing'
import type { PluginDefinition } from '@ultimabase/core'
import { expectTypeOf, test } from 'vitest'

test('types immutable Runtime cost snapshots and probe plugins', () => {
	const probe = new RuntimeCostProbe({ instanceId: 'primary' })
	const before = probe.snapshot()
	const after = probe.snapshot()
	const difference = diffRuntimeCostSnapshots(after, before)

	expectTypeOf(probe.plugin).toEqualTypeOf<PluginDefinition>()
	expectTypeOf(difference).toEqualTypeOf<RuntimeCostSnapshot>()
	assertNoOptionalRuntimeCost(difference)

	// @ts-expect-error -- snapshots are detached immutable measurements.
	difference.requests.behaviorStageCalls = 1
})
