import {
	optionalCapability,
	provideRuntimeBehavior,
	type FrameworkPlugin,
} from '@ultimabase/core'
import { definePluginModule } from '@ultimabase/plugin-kit'
import { immutableArray, immutableRecord } from '@ultimabase/shared'

import { hookContributionsCapability } from './contributions.js'
import { fieldHooksOption, schemaHooksOption } from './options.js'
import {
	hookDiagnosticsObserverCapability,
	type HookDiagnosticsObserver,
} from './runtime/diagnostics.js'
import { compileHookContributionPlan } from './runtime/contribution-plan.js'
import { createHookBehavior } from './runtime/dispatcher.js'
import {
	hookEventContributionsCapability,
	getHookEventImplementation,
} from './runtime/events.js'
import {
	HookExecutionRuntime,
	type OwnedHookEventHandler,
} from './runtime/execution-runtime.js'

const hooksPluginModule = definePluginModule({
	core: '^0.0.0',
	pluginId: '@ultimabase/hooks-plugin',
	version: '0.0.0',
})

const optionalHookContributions = optionalCapability(
	hookContributionsCapability,
	'^1.0.0',
)
const optionalHookEvents = optionalCapability(
	hookEventContributionsCapability,
	'^1.0.0',
)
const optionalHookDiagnostics = optionalCapability(
	hookDiagnosticsObserverCapability,
	'^1.0.0',
)

const hooksRuntimeProvider = provideRuntimeBehavior({
	contributionId: 'official-hooks-runtime',
	create: ({ callbacks, capabilities, schemas }) => {
		const contributions = capabilities
			.contributions(optionalHookContributions)
			.flatMap(({ contributionId, owner, pluginVersion, value }) =>
				value.map((definition) =>
					immutableRecord({
						contributionId,
						definition,
						owner,
						pluginVersion,
					}),
				),
			)
		const eventHandlers: OwnedHookEventHandler[] = []

		for (const contribution of capabilities.contributions(optionalHookEvents)) {
			const implementation = getHookEventImplementation(contribution.value)
			if (implementation === undefined) {
				throw new TypeError('Hook event capabilities must use provideHookEvent')
			}
			eventHandlers.push(
				immutableRecord({
					contributionId: contribution.contributionId,
					implementation,
					owner: contribution.owner,
				}),
			)
		}

		const observer: HookDiagnosticsObserver | undefined = capabilities.get(
			optionalHookDiagnostics,
		)
		const plan = compileHookContributionPlan(schemas, contributions)
		const runtime = new HookExecutionRuntime(
			observer,
			immutableArray(eventHandlers),
			callbacks,
		)

		return immutableRecord({ value: createHookBehavior(plan, runtime) })
	},
})

/** Names one configured official Hooks engine. */
export type HooksPlugin = FrameworkPlugin<'@ultimabase/hooks-plugin'>

/**
 * Installs the official Hook authoring namespaces and Runtime lifecycle.
 *
 * Importing the package alone has no application effect.
 */
export const hooksPlugin = (): HooksPlugin =>
	hooksPluginModule.plugin({
		privileges: [
			{
				name: 'schema:declare',
				reason: 'Declares the official schema and field Hooks options.',
			},
			{
				name: 'runtime:intercept',
				reason:
					'Runs official Hooks through the public Runtime behavior kernel.',
			},
		],
		capabilities: {
			optional: [
				optionalHookContributions,
				optionalHookEvents,
				optionalHookDiagnostics,
			],
			provides: [hooksRuntimeProvider],
		},
		declare: ({ schemas }) => {
			schemas.defineOptions({
				contributionId: 'official-hooks-options',
				field: { hooks: fieldHooksOption },
				schema: { hooks: schemaHooksOption },
			})
		},
	})
