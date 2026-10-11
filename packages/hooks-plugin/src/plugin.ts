import {
	applicationSchemaMutationSurfaceCapability,
	contributeDeclarations,
	defineSchemaOption,
	optionalCapability,
	plugin,
	provideRuntimeBehavior,
	requireCapability,
	type FieldOptionDefinition,
	type PluginDeclarationContribution,
	type PluginDeclarationSource,
	type PluginInstance,
	type PluginSchemaOptionSource,
	type PluginSchemaRulesSource,
	type SchemaRulesHKT,
	type SchemaDefinition,
	type SchemaOptionDefinition,
	type SchemaOptionRuntimeRequirement,
	type SchemaReference,
} from '@ultimabase/core'
import { definePluginFieldOption } from '@ultimabase/plugin-kit'
import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type { SchemaHooks } from './authoring/contracts.js'
import {
	normalizeFieldHookDeclarations,
	normalizeSchemaHookDeclarations,
	type FieldHookDeclarations,
	type SchemaHookDeclarations,
} from './authoring/declarations.js'
import type { SourceFieldHooksOption } from './authoring/source-contracts.js'
import { hookContributionsCapability } from './contributions.js'
import { compileHookContributionPlan } from './runtime/contribution-plan.js'
import { hookDiagnosticsObserverCapability } from './runtime/diagnostics.js'
import { createHookBehavior } from './runtime/dispatcher.js'
import {
	getHookEventImplementation,
	hookEventContributionsCapability,
} from './runtime/events.js'
import { HookExecutionRuntime } from './runtime/execution-runtime.js'

type SchemaForOptions<TOptions> =
	TOptions extends Readonly<{
		readonly className: infer TClassName extends string
	}>
		? SchemaReference<TClassName>
		: SchemaDefinition

/** Resolves the exact generated schema identity from `SchemaOptions<this>`. */
export type SchemaHooksOption<TOptions> = SchemaHooks<
	SchemaForOptions<TOptions>
>

/** Owns the official schema `hooks` namespace as an opaque callback artifact. */
const schemaHooksOption: SchemaOptionDefinition<
	SchemaHookDeclarations | undefined,
	SchemaOptionRuntimeRequirement,
	never
> = defineSchemaOption({
	normalize: normalizeSchemaHookDeclarations,
	protocolVersion: 1,
	typegen: {
		generic: 'self',
		module: '@ultimabase/hooks-plugin',
		type: 'SchemaHooksOption',
	},
	valueKind: 'opaque',
})

/** Owns the official field `hooks` namespace as an opaque callback artifact. */
const fieldHooksOption: FieldOptionDefinition<
	FieldHookDeclarations | undefined,
	SchemaOptionRuntimeRequirement,
	SourceFieldHooksOption
> = definePluginFieldOption({
	contexts: ['stored', 'embedded'],
	normalize: normalizeFieldHookDeclarations,
	protocolVersion: 1,
	typegen: false,
	valueKind: 'opaque',
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
const schemaMutationSurfaceRequirement = requireCapability(
	applicationSchemaMutationSurfaceCapability,
	'^1.0.0',
	{ phase: 'materialization' },
)

const hooksRuntimeProvider = provideRuntimeBehavior({
	contributionId: 'official-hooks-runtime',
	create: ({ callbacks, capabilities, logger, schemas }) => {
		// Core attributes every contribution to its exact plugin instance.
		const contributions = capabilities
			.contributions(optionalHookContributions)
			.flatMap(({ contributionId, owner, pluginVersion, value }) =>
				value.map((definition) =>
					immutableRecord({ contributionId, definition, owner, pluginVersion }),
				),
			)
		const eventHandlers = capabilities
			.contributions(optionalHookEvents)
			.map(({ contributionId, owner, value }) => {
				const implementation = getHookEventImplementation(value)
				if (implementation === undefined) {
					throw new TypeError(
						'Hook event capabilities must use provideHookEvent',
					)
				}
				return immutableRecord({ contributionId, implementation, owner })
			})
		const observer = capabilities.get(optionalHookDiagnostics)
		const plan = compileHookContributionPlan(
			schemas,
			contributions,
			capabilities.get(schemaMutationSurfaceRequirement),
		)
		const runtime = new HookExecutionRuntime(
			observer,
			immutableArray(eventHandlers),
			callbacks,
			logger,
		)

		return immutableRecord({ value: createHookBehavior(plan, runtime) })
	},
})

type HooksOptionSource = PluginSchemaOptionSource<{
	readonly contributionId: 'official-hooks-options'
	readonly field: Readonly<{ hooks: typeof fieldHooksOption }>
	readonly schema: Readonly<{ hooks: typeof schemaHooksOption }>
}>

const hooksDeclarations: PluginDeclarationContribution<
	readonly [],
	HooksOptionSource
> = contributeDeclarations({
	schema: ({ schemas }) =>
		schemas.defineOptions({
			contributionId: 'official-hooks-options',
			field: { hooks: fieldHooksOption },
			schema: { hooks: schemaHooksOption },
		}),
})

// The named alias keeps the reference hover (`source: HooksOptionSource`).
/** Entry of `.with({ ... })` owned by Hooks, for one schema. */
export interface HooksRules<TSchema> {
	/**
	 * Declares schema-owned business behavior run around each operation.
	 * @example `hooks: { beforeOperation: { update: ({ item }) => {} } }`
	 */
	readonly hooks?: SchemaHooks<Extract<TSchema, SchemaDefinition>>
}

/** Contributes `hooks` to `.with({ ... })` through Core's rules slot (ADR-0297). */
export interface HooksSchemaRules extends SchemaRulesHKT {
	readonly rules: HooksRules<this['schema']>
}

type HooksSource =
	| PluginDeclarationSource<typeof hooksDeclarations>
	| PluginSchemaRulesSource<HooksSchemaRules>

/** Names the exact configured official Hooks engine. */
export type HooksPlugin = PluginInstance<{
	readonly id: '@ultimabase/hooks-plugin'
	readonly version: '0.0.0'
	readonly core: '^0.0.0'
	readonly source: HooksSource
}>

/**
 * Installs the official Hook authoring namespaces and Runtime lifecycle.
 *
 * Importing the package alone has no application effect.
 */
export const hooksPlugin = (): HooksPlugin =>
	plugin({
		id: '@ultimabase/hooks-plugin',
		version: '0.0.0',
		core: '^0.0.0',
		contributions: [
			optionalHookContributions,
			optionalHookEvents,
			optionalHookDiagnostics,
			hooksRuntimeProvider,
			schemaMutationSurfaceRequirement,
			hooksDeclarations,
		],
	})
