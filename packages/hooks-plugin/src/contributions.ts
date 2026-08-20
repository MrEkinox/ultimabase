import {
	defineCapability,
	provideCapability,
	type ApplicationCapabilityFactoryContext,
	type CapabilityProviderDeclaration,
	type CapabilityToken,
	type CompiledSchemaRegistry,
	type GenericField,
	type PluginIdentity,
	type PluginCapabilityReader,
	type SchemaDefinition,
	type SchemaExtension,
} from '@ultimabase/core'
import {
	immutableArray,
	immutableRecord,
	type MaybePromise,
} from '@ultimabase/shared'

import type { SchemaHookDeclarations } from './authoring/declarations.js'
import type { SchemaHooks } from './authoring/contracts.js'
import { normalizeSchemaHookDeclarations } from './authoring/declarations.js'
import type { FieldHookDeclarations } from './authoring/field-declarations.js'
import type { FieldHooks } from './authoring/field-contracts.js'
import { normalizeFieldHookDeclarations } from './authoring/field-declarations.js'

/** Identifies the official declaration target selected by a compatible plugin. */
export type HookContributionTargetKind = 'field' | 'global' | 'schema'

export interface GlobalHookContributionDefinition {
	readonly declarations: SchemaHookDeclarations
	readonly schema: undefined
	readonly targetKind: 'global'
}

export interface SchemaHookContributionDefinition {
	readonly declarations: SchemaHookDeclarations
	readonly schema: SchemaDefinition
	readonly targetKind: 'schema'
}

export interface FieldHookContributionDefinition {
	readonly declarations: FieldHookDeclarations
	readonly field: GenericField
	readonly path: readonly [string, ...string[]]
	readonly schema: SchemaDefinition
	readonly targetKind: 'field'
}

/** Carries one normalized official Hook contribution before owner attribution. */
export type HookContributionDefinition =
	| FieldHookContributionDefinition
	| GlobalHookContributionDefinition
	| SchemaHookContributionDefinition

/** Retains Core-attributed ownership for diagnostics and deterministic nesting. */
export interface OwnedHookContribution {
	readonly contributionId: string
	readonly definition: HookContributionDefinition
	readonly owner: PluginIdentity
	readonly pluginVersion: string
}

/** Composes independent official-lifecycle contributions in plugin graph order. */
export type HookContributionsCapability = CapabilityToken<
	readonly HookContributionDefinition[],
	readonly HookContributionDefinition[],
	'ultimabase.hooks.contributions',
	'1.0.0',
	'multiple',
	'application'
>

export const hookContributionsCapability: HookContributionsCapability =
	defineCapability<
		readonly HookContributionDefinition[],
		readonly HookContributionDefinition[]
	>()({
		capabilityId: 'ultimabase.hooks.contributions',
		version: '1.0.0',
		cardinality: 'multiple',
		lifetime: 'application',
		providerPrivilege: 'runtime:intercept',
		compose: (providers) => immutableArray(providers.flat()),
	})

const requireSchemaHooks = (
	hooks: unknown,
	path: string,
): SchemaHookDeclarations => {
	const declarations = normalizeSchemaHookDeclarations(hooks)
	if (declarations === undefined) {
		throw new TypeError(`${path} must declare at least one Hook handler`)
	}
	return declarations
}

const requireFieldHooks = (
	hooks: unknown,
	path: string,
): FieldHookDeclarations => {
	const declarations = normalizeFieldHookDeclarations(hooks)
	if (declarations === undefined) {
		throw new TypeError(`${path} must declare at least one Hook handler`)
	}
	return declarations
}

/** Targets every application schema with one compatible contribution. */
export const globalHooks = (hooks: unknown): GlobalHookContributionDefinition =>
	immutableRecord({
		declarations: requireSchemaHooks(hooks, 'global hooks'),
		schema: undefined,
		targetKind: 'global' as const,
	})

/** Targets one exact application-owned schema. */
export const schemaHooks = <TSchema extends SchemaDefinition>(
	schema: TSchema,
	hooks: SchemaHooks<NoInfer<TSchema>>,
): SchemaHookContributionDefinition =>
	immutableRecord({
		declarations: requireSchemaHooks(hooks, 'schema hooks'),
		schema,
		targetKind: 'schema' as const,
	})

/** Targets one exact nested field path resolved by a compatible plugin. */
export const fieldHooks = <TField extends GenericField>(
	schema: SchemaDefinition,
	field: TField,
	path: readonly [string, ...string[]],
	hooks: FieldHooks<NoInfer<TField>>,
): FieldHookContributionDefinition =>
	immutableRecord({
		declarations: requireFieldHooks(hooks, 'field hooks'),
		field,
		path: immutableArray(path),
		schema,
		targetKind: 'field' as const,
	})

export interface HookContributionFactoryContext {
	/** Reads only requirements declared by the contributing plugin. */
	readonly capabilities: PluginCapabilityReader<'materialization'>
	/** Reads the complete compiled application graph without mutating it. */
	readonly schemas: CompiledSchemaRegistry
}

export type HookContributionFactory = (
	context: HookContributionFactoryContext,
) => MaybePromise<
	HookContributionDefinition | readonly HookContributionDefinition[]
>

/** Supplies one exact schema-extension match to a reusable Hook declaration. */
export interface SchemaExtensionHookContext<
	TExtension extends SchemaExtension<string, object>,
> {
	readonly extension: TExtension
	readonly schema: SchemaDefinition
}

/** Expands one extension selector without requiring a mutable setup registry. */
export const schemaExtensionHooks = <
	TExtension extends SchemaExtension<string, object>,
>(
	schemas: CompiledSchemaRegistry,
	target: TExtension,
	create: (
		context: SchemaExtensionHookContext<NoInfer<TExtension>>,
	) => SchemaHooks<SchemaDefinition>,
): readonly SchemaHookContributionDefinition[] =>
	immutableArray(
		schemas.values().flatMap((schema) =>
			schema.extensions.flatMap((extension) =>
				extension.name === target.name &&
				extension.pluginName === target.pluginName
					? [
							schemaHooks(
								schema,
								create({
									extension: extension as TExtension,
									schema,
								}),
							),
						]
					: [],
			),
		),
	)

/** Creates one owner-attributed application provider for official Hook declarations. */
export const provideHookContributions = (
	contributionId: string,
	create: HookContributionFactory,
): CapabilityProviderDeclaration<typeof hookContributionsCapability> =>
	provideCapability(hookContributionsCapability, {
		contributionId,
		create: async (
			context: ApplicationCapabilityFactoryContext,
		): Promise<
			Readonly<{ readonly value: readonly HookContributionDefinition[] }>
		> => {
			const created = await create({
				capabilities: context.capabilities,
				schemas: context.schemas,
			})
			return immutableRecord({
				value: immutableArray(Array.isArray(created) ? created : [created]),
			})
		},
	})
