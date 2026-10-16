import { provideRuntimeBehavior, type SchemaDefinition } from '@ultimabase/core'
import {
	contributeApplication,
	contributeDeclarations,
	plugin,
	type PluginDeclarationContribution,
	type PluginDeclarationSource,
	type PluginInstance,
	type PluginSchemaOptionSource,
	type PluginSchemaRulesSource,
	type SchemaRulesHKT,
	provideSchemaRules,
} from '@ultimabase/core/plugin'
import { immutableRecord } from '@ultimabase/shared'

import { createValidationCheck, type ValidationPluginExports } from './check.js'
import { fieldValidationOption, schemaValidationOption } from './options.js'
import {
	createValidationPlanCache,
	requiresValidationTargets,
	validateMutationInput,
} from './operation-validation.js'
import type { SchemaValidation } from './schema-validation.js'

type ValidationOptionSource = PluginSchemaOptionSource<{
	readonly contributionId: 'official-field-validation-option'
	readonly field: Readonly<{ validation: typeof fieldValidationOption }>
	readonly schema: Readonly<{ validation: typeof schemaValidationOption }>
}>

const validationDeclarations: PluginDeclarationContribution<
	readonly [],
	ValidationOptionSource
> = contributeDeclarations({
	schema: ({ schemas }) =>
		schemas.defineOptions({
			contributionId: 'official-field-validation-option',
			field: { validation: fieldValidationOption },
			schema: { validation: schemaValidationOption },
		}),
})

/** Entry of `.with((plugins) => …)` owned by Validation, for one schema. */
export interface ValidationRules<TSchema> {
	/**
	 * Checks the complete item of every create and update, after field
	 * validation (ADR-0319): a function or a Standard Schema object validator.
	 * @example `validation: ({ item }) => item.endsAt > item.startsAt || 'Ends before it starts'`
	 */
	readonly validation?: SchemaValidation<Extract<TSchema, SchemaDefinition>>
}

/** Contributes `validation` to `.with((plugins) => …)` through Core's rules slot. */
export interface ValidationSchemaRules extends SchemaRulesHKT {
	readonly rules: ValidationRules<this['schema']>
}

type ValidationSource =
	| PluginDeclarationSource<typeof validationDeclarations>
	| PluginSchemaRulesSource<ValidationSchemaRules>

/** Names the exact configured official validation engine. */
export type ValidationPlugin = PluginInstance<{
	readonly id: '@ultimabase/validation-plugin'
	readonly version: '0.0.0'
	readonly core: '^0.0.0'
	readonly exports: ValidationPluginExports
	readonly source: ValidationSource
}>

/** The `validationPlugin` factory; `ultimabase.plugin(validationPlugin)` reads its exports. */
export interface ValidationPluginFactory {
	/**
	 * Installs field validators, schema checks, their final mutation stage and
	 * `check()` (ADR-0319).
	 * @example `UltimaBase.use(validationPlugin())`
	 */
	(): ValidationPlugin
	readonly pluginId: '@ultimabase/validation-plugin'
}

const createValidationPlugin = (): ValidationPlugin => {
	const runtimeProvider = provideRuntimeBehavior({
		contributionId: 'official-field-validation-runtime',
		create: ({ callbacks }) => {
			const readPlans = createValidationPlanCache()
			return {
				value: {
					requiresPreparedMutationItems: requiresValidationTargets,
					validateMutationInput: (input) =>
						validateMutationInput(input, readPlans(input.operation), callbacks),
				},
			}
		},
	})

	// `.with((plugins) => plugins.validation({ … }))` (ADR-0339).
	return provideSchemaRules<ValidationPlugin>(
		plugin({
			id: '@ultimabase/validation-plugin',
			version: '0.0.0',
			core: '^0.0.0',
			contributions: [
				runtimeProvider,
				validationDeclarations,
				contributeApplication(({ schemas }) => ({
					exports: immutableRecord({ check: createValidationCheck(schemas) }),
				})),
			],
		}),
		['validation'],
	)
}

/** Installs field validators, schema checks and `check()` explicitly. */
export const validationPlugin: ValidationPluginFactory = Object.assign(
	createValidationPlugin,
	{ pluginId: '@ultimabase/validation-plugin' as const },
)
