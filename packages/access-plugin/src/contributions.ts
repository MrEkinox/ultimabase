import {
	defineCapability,
	provideCapability,
	type ApplicationCapabilityFactoryContext,
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

import type { FieldAccess } from './authoring/contracts.js'
import type { SchemaAccess } from './authoring/contracts.js'
import {
	normalizeSchemaAccessDeclarations,
	type SchemaAccessDeclarations,
} from './authoring/declarations.js'
import {
	normalizeFieldAccessDeclarations,
	type FieldAccessDeclarations,
} from './authoring/field-declarations.js'
import type {
	AccessTargetContributionDefinition,
	FieldKindAccessContributionDefinition,
	FieldKindAccessTarget,
	FieldKindAccessTargetContext,
} from './targets.js'

/** Controls whether trusted master requests bypass one compatible policy. */
export type AccessContributionMasterMode = 'bypass' | 'enforce'

interface AccessContributionBase {
	readonly master: AccessContributionMasterMode
}

export interface GlobalAccessContributionDefinition extends AccessContributionBase {
	readonly declarations: SchemaAccessDeclarations
	readonly schema: undefined
	readonly targetKind: 'global'
}

export interface SchemaAccessContributionDefinition extends AccessContributionBase {
	readonly declarations: SchemaAccessDeclarations
	readonly schema: SchemaDefinition
	readonly targetKind: 'schema'
}

export interface FieldAccessContributionDefinition extends AccessContributionBase {
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

const requireSchemaAccess = (
	access: unknown,
	path: string,
): SchemaAccessDeclarations => {
	const declarations = normalizeSchemaAccessDeclarations(access)
	if (declarations === undefined) {
		throw new TypeError(`${path} must declare at least one Access rule`)
	}
	return declarations
}

const requireFieldAccess = (
	access: unknown,
	path: string,
): FieldAccessDeclarations => {
	const declarations = normalizeFieldAccessDeclarations(access)
	if (declarations === undefined) {
		throw new TypeError(`${path} must declare at least one Access rule`)
	}
	return declarations
}

const readMasterMode = (
	options: Readonly<{ readonly master?: AccessContributionMasterMode }>,
): AccessContributionMasterMode => options.master ?? 'enforce'

/** Targets every application schema with one official-compatible policy. */
export const globalAccess = (
	access: SchemaAccess<SchemaDefinition>,
	options: Readonly<{ readonly master?: AccessContributionMasterMode }> = {},
): GlobalAccessContributionDefinition =>
	immutableRecord({
		declarations: requireSchemaAccess(access, 'global Access'),
		master: readMasterMode(options),
		schema: undefined,
		targetKind: 'global' as const,
	})

/** Targets one exact application-owned schema with a compatible policy. */
export const schemaAccess = <TSchema extends SchemaDefinition>(
	schema: TSchema,
	access: SchemaAccess<NoInfer<TSchema>>,
	options: Readonly<{ readonly master?: AccessContributionMasterMode }> = {},
): SchemaAccessContributionDefinition =>
	immutableRecord({
		declarations: requireSchemaAccess(access, 'schema Access'),
		master: readMasterMode(options),
		schema,
		targetKind: 'schema' as const,
	})

/** Targets one exact nested field path with a compatible policy. */
export const fieldAccess = <TField extends GenericField>(
	schema: SchemaDefinition,
	field: TField,
	path: readonly [string, ...string[]],
	access: FieldAccess<NoInfer<TField>>,
	options: Readonly<{ readonly master?: AccessContributionMasterMode }> = {},
): FieldAccessContributionDefinition =>
	immutableRecord({
		declarations: requireFieldAccess(access, 'field Access'),
		field,
		master: readMasterMode(options),
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
	options: Readonly<{ readonly master?: AccessContributionMasterMode }> = {},
): FieldKindAccessContributionDefinition<TField> =>
	immutableRecord({
		create,
		master: readMasterMode(options),
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
		create: async (
			context: ApplicationCapabilityFactoryContext,
		): Promise<
			Readonly<{ readonly value: readonly AccessContributionDefinition[] }>
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
