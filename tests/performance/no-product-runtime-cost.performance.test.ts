import {
	assertNoOptionalRuntimeCost,
	type RuntimeCostSnapshot,
} from '../../packages/core/tests/performance/runtime-cost-probe.test-support.js'
import { describe, expect, it } from 'vitest'

import {
	runRuntimeCostScenario,
	type RuntimeCostScenarioResult,
} from './fixtures/runtime-cost-scenario.js'

const totalCost = (result: RuntimeCostScenarioResult): RuntimeCostSnapshot => ({
	startup: result.startup.startup,
	requests: {
		behaviorStageCalls:
			result.read.requests.behaviorStageCalls +
			result.mutation.requests.behaviorStageCalls,
		enforcementStageCalls:
			result.read.requests.enforcementStageCalls +
			result.mutation.requests.enforcementStageCalls,
	},
})

const expectedDatabaseWork = {
	reads: 1,
	preparedMutations: 1,
	executedMutations: 1,
	transactions: 1,
	commits: 1,
}

describe('optional product Runtime cost', () => {
	it('compares no product, official Hooks, official Access, and both products', async () => {
		const none = await runRuntimeCostScenario('no-product')
		const hooks = await runRuntimeCostScenario('hooks')
		const access = await runRuntimeCostScenario('access')
		const both = await runRuntimeCostScenario('hooks-and-access')

		expect(none.startup).toStrictEqual({
			startup: {
				runtimeAssemblies: 1,
				behaviorBundles: 0,
				behaviorStages: 0,
				enforcementBundles: 0,
				enforcementStages: 0,
			},
			requests: {
				behaviorStageCalls: 0,
				enforcementStageCalls: 0,
			},
		})
		assertNoOptionalRuntimeCost(totalCost(none))
		expect(Object.isFrozen(none.startup)).toBe(true)
		expect(Object.isFrozen(none.startup.startup)).toBe(true)
		expect(Object.isFrozen(none.read)).toBe(true)
		expect(Object.isFrozen(none.read.requests)).toBe(true)

		expect(hooks.startup.startup).toMatchObject({
			runtimeAssemblies: 1,
			behaviorBundles: 1,
			enforcementBundles: 0,
			enforcementStages: 0,
		})
		expect(hooks.startup.startup.behaviorStages).toBeGreaterThan(0)
		expect(totalCost(hooks).requests.behaviorStageCalls).toBeGreaterThan(0)
		expect(totalCost(hooks).requests.enforcementStageCalls).toBe(0)

		expect(access.startup.startup).toMatchObject({
			runtimeAssemblies: 1,
			behaviorBundles: 0,
			behaviorStages: 0,
			enforcementBundles: 1,
		})
		expect(access.startup.startup.enforcementStages).toBeGreaterThan(0)
		expect(totalCost(access).requests.behaviorStageCalls).toBe(0)
		expect(totalCost(access).requests.enforcementStageCalls).toBeGreaterThan(0)

		expect(both.startup.startup).toMatchObject({
			runtimeAssemblies: 1,
			behaviorBundles: 1,
			enforcementBundles: 1,
		})
		expect(both.startup.startup.behaviorStages).toBe(
			hooks.startup.startup.behaviorStages,
		)
		expect(both.startup.startup.enforcementStages).toBe(
			access.startup.startup.enforcementStages,
		)
		expect(totalCost(both).requests.behaviorStageCalls).toBeGreaterThan(0)
		expect(totalCost(both).requests.enforcementStageCalls).toBeGreaterThan(0)

		for (const result of [none, hooks, access, both]) {
			expect(result.database).toStrictEqual(expectedDatabaseWork)
		}
	})

	it('rejects an intentionally inserted neutral optional stage', async () => {
		const result = await runRuntimeCostScenario('neutral-behavior')

		expect(result.startup.startup).toMatchObject({
			behaviorBundles: 1,
			behaviorStages: 1,
			enforcementBundles: 0,
		})
		expect(totalCost(result).requests.behaviorStageCalls).toBe(2)
		expect(() => {
			assertNoOptionalRuntimeCost(totalCost(result))
		}).toThrow('Expected no optional Runtime work')
	})
})
