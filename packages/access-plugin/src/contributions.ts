import {
	defineCapability,
	provideCapability,
	type CapabilityProviderDeclaration,
	type CapabilityToken,
	type CompiledSchemaRegistry,
	type GenericField,
	type PluginCapabilityReader,
	type PluginIdentity,
	type SchemaDefinition,
} from '@ultimabase/core'
import {
	immutableArray,
	immutableRecord,
	type MaybePromise,
} from '@ultimabase/shared'

import type { FieldAccess, SchemaAccess } from './authoring/contracts.js'
import {
	normalizeFieldAccessDeclarations,
	normalizeSchemaAccessDeclarations,
	type FieldAccessDeclarations,
	type SchemaAccessDeclarations,
} from './authoring/declarations.js'
import type {
	AccessTargetContributionDefinition,
	FieldKindAccessContributionDefinition,
	FieldKindAccessTarget,
	FieldKindAccessTargetContext,
} from './targets.js'

export interface GlobalAccessContributionDefinition {
	readonly declarations: SchemaAccessDeclarations
	readonly schema: undefined
	readonly targetKind: 'global'
}

export interface SchemaAccessContributionDefinition {
	readonly declarations: SchemaAccessDeclarations
	readonly schema: SchemaDefinition
	readonly targetKind: 'schema'
}

export interface FieldAccessContributionDefinition {
	readonly declarations: FieldAccessDeclarations
	readonly field: GenericField
	readonly path: readonly [string, ...string[]]
	readonly schema: SchemaDefinition
	readonly targetKind: 'field'
}

/** Carries one normalized official Access policy before Core attributes ownership. */
export type AccessContributionDefinition =
	| AccessTargetContributionDefinition
	| FieldAccessContributionDefinition
	| GlobalAccessContributionDefinition
	| SchemaAccessContributionDefinition

/** Retains deterministic capability ownership for diagnostics and ordering. */
export interface OwnedAccessContribution {
	readonly contributionId: string
	readonly definition: AccessContributionDefinition
	readonly owner: PluginIdentity
	readonly pluginVersion: string
}

export type AccessContributionsCapability = CapabilityToken<
	readonly AccessContributionDefinition[],
	readonly AccessContributionDefinition[],
	'ultimabase.access.contributions',
	'1.0.0',
	'multiple',
	'application'
>

/** Composes official-compatible policies in deterministic plugin graph order. */
export const accessContributionsCapability: AccessContributionsCapability =
	defineCapability<
		readonly AccessContributionDefinition[],
		readonly AccessContributionDefinition[]
	>()({
		capabilityId: 'ultimabase.access.contributions',
		version: '1.0.0',
		cardinality: 'multiple',
		lifetime: 'application',
		providerPrivilege: 'runtime:constrain',
		compose: (providers) => immutableArray(providers.flat()),
	})

/** Rejects empty provider policies, which would contribute no Access rule. */
const requireDeclarations = <TDeclarations>(
	declarations: TDeclarations | undefined,
	path: string,
): TDeclarations => {
	if (declarations === undefined) {
		throw new TypeError(`${path} must declare at least one Access rule`)
	}
	return declarations
}

/** Targets every application schema with one official-compatible policy. */
export const globalAccess = (
	access: SchemaAccess<SchemaDefinition>,
): GlobalAccessContributionDefinition =>
	immutableRecord({
		declarations: requireDeclarations(
			normalizeSchemaAccessDeclarations(access),
			'global Access',
		),
		schema: undefined,
		targetKind: 'global' as const,
	})

/** Targets one exact application-owned schema with a compatible policy. */
export const schemaAccess = <TSchema extends SchemaDefinition>(
	schema: TSchema,
	access: SchemaAccess<NoInfer<TSchema>>,
): SchemaAccessContributionDefinition =>
	immutableRecord({
		declarations: requireDeclarations(
			normalizeSchemaAccessDeclarations(access),
			'schema Access',
		),
		schema,
		targetKind: 'schema' as const,
	})

/** Targets one exact nested field path with a compatible policy. */
export const fieldAccess = <TField extends GenericField>(
	schema: SchemaDefinition,
	field: TField,
	path: readonly [string, ...string[]],
	access: FieldAccess<NoInfer<TField>>,
): FieldAccessContributionDefinition =>
	immutableRecord({
		declarations: requireDeclarations(
			normalizeFieldAccessDeclarations(access),
			'field Access',
		),
		field,
		path: immutableArray(path),
		schema,
		targetKind: 'field' as const,
	})

/** Expands one typed policy over a namespaced community field kind. */
export const fieldKindAccess = <TField extends GenericField>(
	target: FieldKindAccessTarget<TField>,
	create: (
		context: FieldKindAccessTargetContext<NoInfer<TField>>,
	) => FieldAccess<TField>,
): FieldKindAccessContributionDefinition<TField> =>
	immutableRecord({
		create,
		target,
		targetKind: 'field-kind' as const,
	})

export interface AccessContributionFactoryContext {
	/** Reads only requirements declared by the contributing plugin. */
	readonly capabilities: PluginCapabilityReader<'materialization'>
	/** Reads the compiled application graph without mutating it. */
	readonly schemas: CompiledSchemaRegistry
}

export type AccessContributionFactory = (
	context: AccessContributionFactoryContext,
) => MaybePromise<
	AccessContributionDefinition | readonly AccessContributionDefinition[]
>

/** Creates one owner-attributed provider for official Access policies. */
export const provideAccessContributions = (
	contributionId: string,
	create: AccessContributionFactory,
): CapabilityProviderDeclaration<typeof accessContributionsCapability> =>
	provideCapability(accessContributionsCapability, {
		contributionId,
		create: async ({ capabilities, schemas }) => {
			const created = await create({ capabilities, schemas })
			return immutableRecord({
				value: immutableArray(Array.isArray(created) ? created : [created]),
			})
		},
	})
