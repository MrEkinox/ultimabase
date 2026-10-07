import {
	contributeDeclarations,
	plugin,
	provideRuntimeBehavior,
	type PluginDeclarationContribution,
	type PluginDeclarationSource,
	type PluginInstance,
	type PluginSchemaOptionSource,
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
export const validationPlugin = (): ValidationPlugin =>
	plugin({
		id: '@ultimabase/validation-plugin',
		version: '0.0.0',
		core: '^0.0.0',
		permissions: validationPluginPermissions,
		contributions: [
			provideRuntimeBehavior({
				contributionId: 'official-field-validation-runtime',
				create: ({ callbacks }) => {
					const readPlans = createValidationPlanCache()
					return {
						value: {
							guardMutationInput: (input) => {
								validateMutationInput(
									input,
									readPlans(input.operation),
									callbacks,
								)
							},
							requiresPreparedMutationItems: requiresValidationTargets,
						},
					}
				},
			}),
			validationDeclarations,
		],
	})
