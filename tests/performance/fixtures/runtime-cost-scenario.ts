import { accessPlugin } from '@ultimabase/access-plugin'
import { provideRuntimeBehavior, UltimaBase } from '@ultimabase/core'
import { plugin, type PluginDefinition } from '@ultimabase/core/plugin'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import {
	diffRuntimeCostSnapshots,
	RuntimeCostProbe,
	type RuntimeCostSnapshot,
} from '../../../packages/core/tests/performance/runtime-cost-probe.test-support.js'

import {
	DeterministicDatabaseAdapter,
	deterministicDatabasePlugin,
	type DeterministicDatabaseCounts,
} from './deterministic-database.js'

const MeasuredPost = UltimaBase.Schema.define({
	className: 'RuntimeCostMeasuredPost',
	fields: (field) => ({ title: field.string() }),
})

export type RuntimeCostConfiguration =
	'no-product' | 'hooks' | 'access' | 'hooks-and-access' | 'neutral-behavior'

export interface RuntimeCostScenarioResult {
	readonly configuration: RuntimeCostConfiguration
	readonly startup: RuntimeCostSnapshot
	readonly read: RuntimeCostSnapshot
	readonly mutation: RuntimeCostSnapshot
	readonly database: DeterministicDatabaseCounts
}

const neutralBehaviorPlugin = (): PluginDefinition =>
	plugin({
		id: 'fixture.neutral-runtime-behavior',
		version: '0.0.0',
		core: '^0.0.0',
		permissions: {
			'runtime:intercept':
				'Proves the performance fixture detects one neutral stage.',
		},
		contributions: [
			provideRuntimeBehavior({
				contributionId: 'neutral-stage',
				create: () => ({
					value: { beforeOperation: () => undefined },
				}),
			}),
		],
	})

const optionalPlugins = (
	configuration: RuntimeCostConfiguration,
): readonly PluginDefinition[] => {
	switch (configuration) {
		case 'no-product':
			return []
		case 'hooks':
			return [hooksPlugin()]
		case 'access':
			return [accessPlugin({ default: true })]
		case 'hooks-and-access':
			return [hooksPlugin(), accessPlugin({ default: true })]
		case 'neutral-behavior':
			return [neutralBehaviorPlugin()]
	}
}

/** Executes identical read and mutation work against one optional-engine graph. */
export const runRuntimeCostScenario = async (
	configuration: RuntimeCostConfiguration,
): Promise<RuntimeCostScenarioResult> => {
	const adapter = new DeterministicDatabaseAdapter()
	const probe = new RuntimeCostProbe()
	const Application = UltimaBase.use(
		...optionalPlugins(configuration),
		deterministicDatabasePlugin(adapter),
	)
	const ultimabase = new Application({
		logger: false,
		schemas: [MeasuredPost],
	})

	return probe.run(async () => {
		await ultimabase.start()
		const startup = probe.snapshot()
		const beforeRead = probe.snapshot()
		await MeasuredPost.findMany()
		const afterRead = probe.snapshot()
		await MeasuredPost.createOne({ data: { title: 'Measured mutation' } })
		const afterMutation = probe.snapshot()
		await ultimabase.dispose()

		return Object.freeze({
			configuration,
			startup,
			read: diffRuntimeCostSnapshots(afterRead, beforeRead),
			mutation: diffRuntimeCostSnapshots(afterMutation, afterRead),
			database: adapter.snapshot(),
		})
	})
}
