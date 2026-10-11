import { provideRuntimeBehavior } from '@ultimabase/core'
import {
	contributeDeclarations,
	plugin,
	type PluginDeclarationContribution,
	type PluginDeclarationSource,
	type PluginInstance,
	type PluginSchemaOptionSource,
} from '@ultimabase/core/plugin'

import { fieldValidationOption } from './options.js'
import {
	createValidationPlanCache,
	requiresValidationTargets,
	validateMutationInput,
} from './operation-validation.js'

type ValidationOptionSource = PluginSchemaOptionSource<{
	readonly contributionId: 'official-field-validation-option'
	readonly field: Readonly<{ validation: typeof fieldValidationOption }>
}>

const validationDeclarations: PluginDeclarationContribution<
	readonly [],
	ValidationOptionSource
> = contributeDeclarations({
	schema: ({ schemas }) =>
		schemas.defineOptions({
			contributionId: 'official-field-validation-option',
			field: { validation: fieldValidationOption },
		}),
})

type ValidationSource = PluginDeclarationSource<typeof validationDeclarations>

/** Names the exact configured official field-validation engine. */
export type ValidationPlugin = PluginInstance<{
	readonly id: '@ultimabase/validation-plugin'
	readonly version: '0.0.0'
	readonly core: '^0.0.0'
	readonly source: ValidationSource
}>

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
		contributions: [runtimeProvider, validationDeclarations],
	})
}
