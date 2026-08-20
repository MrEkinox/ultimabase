import {
	optionalCapability,
	provideRuntimeBehavior,
	type CapabilityProviderDeclaration,
	type CapabilityRequirement,
	type runtimeBehaviorCapability,
} from '@ultimabase/core'
import {
	definePluginModule,
	type PluginModule,
	type PluginModuleInstance,
} from '@ultimabase/plugin-kit'
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

const hooksPluginModule: PluginModule<
	'@ultimabase/hooks-plugin',
	'0.0.0',
	'^0.0.0'
> = definePluginModule({
	core: '^0.0.0',
	pluginId: '@ultimabase/hooks-plugin',
	version: '0.0.0',
})

const optionalHookContributions: CapabilityRequirement<
	typeof hookContributionsCapability,
	true,
	'^1.0.0',
	'materialization'
> = optionalCapability(hookContributionsCapability, '^1.0.0')
const optionalHookEvents: CapabilityRequirement<
	typeof hookEventContributionsCapability,
	true,
	'^1.0.0',
	'materialization'
> = optionalCapability(hookEventContributionsCapability, '^1.0.0')
const optionalHookDiagnostics: CapabilityRequirement<
	typeof hookDiagnosticsObserverCapability,
	true,
	'^1.0.0',
	'materialization'
> = optionalCapability(hookDiagnosticsObserverCapability, '^1.0.0')

const hooksRuntimeProvider: CapabilityProviderDeclaration<
	typeof runtimeBehaviorCapability
> = provideRuntimeBehavior({
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

const hooksPluginPrivileges = [
	{
		name: 'schema:declare',
		reason: 'Declares the official schema and field Hooks options.',
	},
	{
		name: 'runtime:intercept',
		reason: 'Runs official Hooks through the public Runtime behavior kernel.',
	},
] as const
const hooksPluginCapabilities: Readonly<{
	readonly optional: readonly [
		typeof optionalHookContributions,
		typeof optionalHookEvents,
		typeof optionalHookDiagnostics,
	]
	readonly provides: readonly [typeof hooksRuntimeProvider]
}> = {
	optional: [
		optionalHookContributions,
		optionalHookEvents,
		optionalHookDiagnostics,
	],
	provides: [hooksRuntimeProvider],
} as const
type HooksPluginDefinition = Readonly<{
	readonly capabilities: typeof hooksPluginCapabilities
	readonly privileges: typeof hooksPluginPrivileges
}>

/** Names the exact configured official Hooks engine. */
export type HooksPlugin = PluginModuleInstance<
	typeof hooksPluginModule,
	HooksPluginDefinition
>

/**
 * Installs the official Hook authoring namespaces and Runtime lifecycle.
 *
 * Importing the package alone has no application effect.
 */
export const hooksPlugin = (): HooksPlugin =>
	hooksPluginModule.plugin({
		privileges: hooksPluginPrivileges,
		capabilities: hooksPluginCapabilities,
		declare: ({ schemas }) => {
			schemas.defineOptions({
				contributionId: 'official-hooks-options',
				field: { hooks: fieldHooksOption },
				schema: { hooks: schemaHooksOption },
			})
		},
	})
