import {
	contributeDeclarations,
	plugin,
	provideRuntimeBehavior,
	type PluginInstance,
} from '@ultimabase/core'

import { fieldValidationOption } from './options.js'
import {
	createValidationPlanCache,
	requiresValidationTargets,
	validateMutationInput,
} from './operation-validation.js'

const validationPluginPermissions = {
	'schema:declare': 'Declares the official field validation option.',
	'runtime:intercept':
		'Rejects final mutation candidates using installed field validators.',
} as const

/** Names the exact configured official field-validation engine. */
export type ValidationPlugin = PluginInstance<
	'@ultimabase/validation-plugin',
	undefined,
	undefined,
	'0.0.0',
	'^0.0.0'
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

	return plugin({
		id: '@ultimabase/validation-plugin',
		version: '0.0.0',
		core: '^0.0.0',
		permissions: validationPluginPermissions,
		contributions: [
			runtimeProvider,
			contributeDeclarations({
				schema: ({ schemas }) => {
					schemas.defineOptions({
						contributionId: 'official-field-validation-option',
						field: { validation: fieldValidationOption },
					})
					return undefined
				},
			}),
		],
	})
}
