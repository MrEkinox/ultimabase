import {
	applicationSchemaMutationSurfaceCapability,
	contributeDeclarations,
	optionalCapability,
	plugin,
	provideRuntimeBehavior,
	requireCapability,
	type CapabilityProviderDeclaration,
	type CapabilityRequirement,
	type PluginInstance,
	type runtimeBehaviorCapability,
} from '@ultimabase/core'
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
const schemaMutationSurfaceRequirement: CapabilityRequirement<
	typeof applicationSchemaMutationSurfaceCapability,
	false,
	'^1.0.0',
	'materialization'
> = requireCapability(applicationSchemaMutationSurfaceCapability, '^1.0.0', {
	phase: 'materialization',
})

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
		const plan = compileHookContributionPlan(
			schemas,
			contributions,
			capabilities.get(schemaMutationSurfaceRequirement),
		)
		const runtime = new HookExecutionRuntime(
			observer,
			immutableArray(eventHandlers),
			callbacks,
		)

		return immutableRecord({ value: createHookBehavior(plan, runtime) })
	},
})

const hooksPluginPermissions = {
	'schema:declare': 'Declares the official schema and field Hooks options.',
	'runtime:intercept':
		'Runs official Hooks through the public Runtime behavior kernel.',
} as const

/** Names the exact configured official Hooks engine. */
export type HooksPlugin = PluginInstance<
	'@ultimabase/hooks-plugin',
	undefined,
	undefined,
	'0.0.0',
	'^0.0.0'
>

/**
 * Installs the official Hook authoring namespaces and Runtime lifecycle.
 *
 * Importing the package alone has no application effect.
 */
export const hooksPlugin = (): HooksPlugin => {
	const declarations = contributeDeclarations({
		schema: ({ schemas }) => {
			schemas.defineOptions({
				contributionId: 'official-hooks-options',
				field: { hooks: fieldHooksOption },
				schema: { hooks: schemaHooksOption },
			})
			return undefined
		},
	})
	const instance = plugin({
		id: '@ultimabase/hooks-plugin',
		version: '0.0.0',
		core: '^0.0.0',
		permissions: hooksPluginPermissions,
		contributions: [
			optionalHookContributions,
			optionalHookEvents,
			optionalHookDiagnostics,
			hooksRuntimeProvider,
			schemaMutationSurfaceRequirement,
			declarations,
		],
	})
	return instance
}
