import {
	applicationSchemaMutationSurfaceCapability,
	provideRuntimeBehavior,
	type SchemaDefinition,
	type SchemaReference,
} from '@ultimabase/core'
import {
	contributeDeclarations,
	defineSchemaOption,
	optionalCapability,
	plugin,
	requireCapability,
	type FieldOptionDefinition,
	type PluginDeclarationContribution,
	type PluginDeclarationSource,
	type PluginInstance,
	type PluginSchemaOptionSource,
	type PluginSchemaRulesSource,
	type SchemaRulesHKT,
	type SchemaOptionDefinition,
	type SchemaOptionRuntimeRequirement,
} from '@ultimabase/core/plugin'
import {
	definePluginFieldOption,
	definePluginOptionsParser,
} from '@ultimabase/plugin-kit'
import {
	immutableArray,
	immutableRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import type { SchemaHooks } from './authoring/contracts.js'
import {
	normalizeFieldHookDeclarations,
	normalizeGlobalHookDeclarations,
	normalizeSchemaHookDeclarations,
	type FieldHookDeclarations,
	type SchemaHookDeclarations,
} from './authoring/declarations.js'
import type { GlobalHooks } from './authoring/global-contracts.js'
import type { SourceFieldHooksOption } from './authoring/source-contracts.js'
import { hookContributionsCapability } from './contributions.js'
import { compileHookContributionPlan } from './runtime/contribution-plan.js'
import { hookDiagnosticsObserverCapability } from './runtime/diagnostics.js'
import { createHookBehavior } from './runtime/dispatcher.js'
import {
	getHookEventImplementation,
	hookEventContributionsCapability,
	type HookEventDefinition,
} from './runtime/events.js'
import {
	HookExecutionRuntime,
	type OwnedHookEventHandler,
} from './runtime/execution-runtime.js'

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

/** Configures the Hooks plugin; every option is optional. */
export interface HooksPluginOptions {
	/**
	 * Hooks run for every schema, before each schema's own hooks (ADR-0318).
	 * @example `global: { afterCommit: { all: ({ schema, kind }) => audit(schema, kind) } }`
	 */
	readonly global?: GlobalHooks
	/**
	 * Consumers of typed events, bound with `onEvent`; they run after commit,
	 * in this order, best effort within the process (ADR-0318).
	 * @example `events: [onEvent(todoCreated, ({ event }) => notify(event.payload.todoId))]`
	 */
	readonly events?: readonly HookEventDefinition[]
}

interface HooksPluginPlan {
	readonly events: readonly OwnedHookEventHandler[]
	readonly global: SchemaHookDeclarations | undefined
}

const parseOptions = definePluginOptionsParser({
	name: 'Hooks plugin options',
	keys: ['events', 'global'] as const,
	normalize: ({ events, global }): HooksPluginPlan => {
		if (events !== undefined && !isUnknownArray(events)) {
			throw new TypeError('Hooks plugin events must be an array of onEvent()')
		}
		return immutableRecord({
			events: immutableArray(
				(events ?? []).map((definition, index) => {
					const implementation = getHookEventImplementation(definition)
					if (implementation === undefined) {
						throw new TypeError(
							`Hooks plugin events[${String(index)}] must be created by onEvent`,
						)
					}
					return immutableRecord({
						contributionId: `events[${String(index)}]`,
						implementation,
						owner: undefined,
					})
				}),
			),
			global: normalizeGlobalHookDeclarations(global),
		})
	},
})

const createHooksRuntimeProvider = (options: HooksPluginPlan) =>
	provideRuntimeBehavior({
		contributionId: 'official-hooks-runtime',
		create: ({ callbacks, capabilities, logger, schemas }) => {
			// Core attributes every contribution to its exact plugin instance.
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
			const pluginEventHandlers = capabilities
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
				options.global,
			)
			const runtime = new HookExecutionRuntime(
				observer,
				// Application consumers first, then plugin consumers in graph order.
				immutableArray([...options.events, ...pluginEventHandlers]),
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
 *
 * @example `UltimaBase.use(hooksPlugin({ events: [onEvent(todoCreated, notify)] }))`
 */
export const hooksPlugin = (options: HooksPluginOptions = {}): HooksPlugin =>
	plugin({
		id: '@ultimabase/hooks-plugin',
		version: '0.0.0',
		core: '^0.0.0',
		contributions: [
			optionalHookContributions,
			optionalHookEvents,
			optionalHookDiagnostics,
			createHooksRuntimeProvider(parseOptions(options)),
			schemaMutationSurfaceRequirement,
			hooksDeclarations,
		],
	})
