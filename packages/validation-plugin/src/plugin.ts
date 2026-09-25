import {
	definePluginModule,
	provideRuntimeBehavior,
	type CapabilityProviderDeclaration,
	type PluginModule,
	type PluginModuleInstance,
	type runtimeBehaviorCapability,
} from '@ultimabase/core'

import { fieldValidationOption } from './options.js'
import {
	createValidationPlanCache,
	requiresValidationTargets,
	validateMutationInput,
} from './operation-validation.js'

const validationPluginModule: PluginModule<
	'@ultimabase/validation-plugin',
	'0.0.0',
	'^0.0.0'
> = definePluginModule({
	core: '^0.0.0',
	pluginId: '@ultimabase/validation-plugin',
	version: '0.0.0',
})

const validationPluginPrivileges = [
	{
		name: 'schema:declare',
		reason: 'Declares the official field validation option.',
	},
	{
		name: 'runtime:intercept',
		reason:
			'Rejects final mutation candidates using installed field validators.',
	},
] as const

type ValidationPluginDefinition = Readonly<{
	readonly capabilities: readonly [
		CapabilityProviderDeclaration<typeof runtimeBehaviorCapability>,
	]
	readonly privileges: typeof validationPluginPrivileges
}>

/** Names the exact configured official field-validation engine. */
export type ValidationPlugin = PluginModuleInstance<
	typeof validationPluginModule,
	ValidationPluginDefinition
>

/** Installs direct field validation and its final mutation guard explicitly. */
export const validationPlugin = (): ValidationPlugin => {
	const runtimeProvider = provideRuntimeBehavior({
		contributionId: 'official-field-validation-runtime',
		create: ({ callbacks }) => {
			const readPlans = createValidationPlanCache()
			return {
				value: {
					guardMutationInput: (input) => {
						validateMutationInput(input, readPlans(input.operation), callbacks)
					},
					requiresPreparedMutationItems: requiresValidationTargets,
				},
			}
		},
	})

	return validationPluginModule.plugin({
		privileges: validationPluginPrivileges,
		capabilities: [runtimeProvider],
		declare: ({ schemas }) => {
			schemas.defineOptions({
				contributionId: 'official-field-validation-option',
				field: { validation: fieldValidationOption },
			})
		},
	})
}
