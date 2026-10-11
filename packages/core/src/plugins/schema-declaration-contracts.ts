import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import type { JsonValue } from '../schema/fields/builtins/json.js'

import { snapshotJsonValue } from '../schema/fields/builtins/json.js'

import type { GenericField } from '../schema/fields/base/contract.js'

import type { SchemaDefinition } from '../schema/schema/definition.js'
import type { FieldDeclarationContext } from '../schema/schema/field-contexts.js'

import {
	createSchemaContributionProvenance,
	type PluginSchemaContributionOwner,
	type SchemaCompilationProvenance,
	type SchemaContributionProvenance,
} from '../schema/schema/provenance.js'

import {
	type FieldOptionDefinition,
	type SchemaOptionDefinition,
	type SchemaOptionSource,
	type SchemaOptionRuntimeCompilationContext,
	type SchemaOptionRuntimeCompiler,
	type SchemaOptionRuntimeRequirement,
} from './schema-option-definitions.js'
import { isSamePluginIdentity } from './manifest.js'
import type {
	PluginSourceProjection,
	PluginSourceReceipt,
} from './source-projections.js'

import type { ApplicationSurfaceDeclarations } from './application-surface-declarations.js'
import {
	type SchemaPatchOperation,
	type SchemaSelection,
	type SchemaSelectorOptions,
} from './schema-patch-contracts.js'
import type {
	MutableTypegenDeclarations,
	TypegenDeclarations,
} from './typegen-declarations.js'
import { assertPlainObject } from '../exact-object-validation.js'

export interface PluginSchemaSourceOptions<
	TSchema extends SchemaDefinition = SchemaDefinition,
> {
	readonly contributionId: string
	readonly schema: TSchema
	readonly staticOptions?: Readonly<Record<string, JsonValue>>
}

export interface PluginSchemaOptionNamespace<
	TField extends Readonly<Record<string, FieldOptionDefinition>> | undefined =
		Readonly<Record<string, FieldOptionDefinition>> | undefined,
	TSchema extends Readonly<Record<string, SchemaOptionDefinition>> | undefined =
		Readonly<Record<string, SchemaOptionDefinition>> | undefined,
> {
	readonly contributionId: string
	readonly field?: TField
	readonly schema?: TSchema
	readonly staticOptions?: Readonly<Record<string, JsonValue>>
}

type SchemaOptionTemplate<TOptions> = {
	readonly [
		TName in keyof TOptions as SchemaOptionSource<TOptions[TName]> extends never
			? never
			: TName
	]?: SchemaOptionSource<TOptions[TName]>
}

// Options typed elsewhere (`never` source, such as `.with` rules) project
// nothing, so a namespace of only such options adds no template to resolve.
type SchemaOptionSourceProjection<TOptions> =
	TOptions extends Readonly<Record<string, SchemaOptionDefinition>>
		? [keyof SchemaOptionTemplate<TOptions>] extends [never]
			? never
			: Readonly<{
					schemaOptions: Readonly<{
						template: SchemaOptionTemplate<TOptions>
					}>
				}>
		: never

type FieldOptionSourceProjection<TOptions> =
	TOptions extends Readonly<Record<string, FieldOptionDefinition>>
		? {
				[
					TName in keyof TOptions
				]: TOptions[TName] extends FieldOptionDefinition<
					unknown,
					SchemaOptionRuntimeRequirement,
					infer TSource
				>
					? TOptions[TName]['contexts'][number] extends infer TContext extends
							FieldDeclarationContext
						? Readonly<{
								fieldOptions: Readonly<
									Record<TContext, Readonly<Partial<Record<TName, TSource>>>>
								>
							}>
						: never
					: never
			}[keyof TOptions]
		: never

type OptionNamespaceSourceProjection<
	TOptions extends PluginSchemaOptionNamespace,
> =
	| SchemaOptionSourceProjection<TOptions['schema']>
	| FieldOptionSourceProjection<TOptions['field']>

/** Derives one source projection directly from the option definitions it installs. */
export type PluginSchemaOptionSource<
	TOptions extends PluginSchemaOptionNamespace,
> = Extract<OptionNamespaceSourceProjection<TOptions>, PluginSourceProjection>

type PatchSourceProjection<
	TOperations extends readonly SchemaPatchOperation[],
	TSelection extends SchemaSelection,
> = TOperations[number] extends infer TOperation
	? TOperation extends Readonly<{
			field: infer TField extends GenericField
			kind: 'field:add'
			name: infer TName extends string
		}>
		? Readonly<{
				schemaFields: Readonly<
					{
						template: Readonly<Record<TName, TField>>
					} & (TSelection['selector'] extends Readonly<{
						className: infer TClassName extends string
					}>
						? { classNames: readonly [TClassName] }
						: { selector: TSelection['selector'] })
				>
			}>
		: never
	: never

/** Derives one source projection from the exact patch and schema selection. */
export type PluginSchemaPatchSource<
	TOperations extends readonly SchemaPatchOperation[],
	TSelection extends SchemaSelection,
> = Extract<
	PatchSourceProjection<TOperations, TSelection>,
	PluginSourceProjection
>

export interface PluginSchemaDeclarationRegistrar {
	add<const TSchema extends SchemaDefinition>(
		options: PluginSchemaSourceOptions<TSchema>,
	): void
	/** Assigns plugin ownership to one exact schema already registered by the application. */
	claim<const TSchema extends SchemaDefinition>(
		options: PluginSchemaSourceOptions<TSchema>,
	): void
	defineOptions<const TOptions extends PluginSchemaOptionNamespace>(
		options: TOptions,
	): PluginSourceReceipt<
		Extract<OptionNamespaceSourceProjection<TOptions>, PluginSourceProjection>
	>
	patch<
		const TOperations extends readonly SchemaPatchOperation[],
		const TSelection extends SchemaSelection,
	>(options: {
		readonly operations: TOperations
		readonly staticOptions?: Readonly<Record<string, JsonValue>>
		readonly targets: TSelection
	}): PluginSourceReceipt<PluginSchemaPatchSource<TOperations, TSelection>>
	select<const TSelector extends SchemaSelectorOptions>(
		selector: TSelector,
	): SchemaSelection<TSelector>
}

export interface OwnedOptionDefinition {
	readonly contributionId: string
	readonly definition: SchemaOptionDefinition | FieldOptionDefinition
	readonly name: string
	readonly owner: PluginSchemaContributionOwner
	readonly scope: 'field' | 'schema'
	readonly staticOptions: Readonly<Record<string, JsonValue>>
}

/** Attributes an option definition to the plugin contribution that declared it. */
export const optionDefinitionProvenance = (
	descriptor: OwnedOptionDefinition,
): SchemaContributionProvenance =>
	createSchemaContributionProvenance(
		descriptor.owner,
		descriptor.contributionId,
		descriptor.staticOptions,
		descriptor.definition.protocolVersion,
	)

export interface OptionDefinitionIndex {
	readonly field: ReadonlyMap<string, readonly OwnedOptionDefinition[]>
	readonly schema: ReadonlyMap<string, readonly OwnedOptionDefinition[]>
}

export type ResolvedFieldOptions = WeakMap<
	object,
	Map<
		FieldDeclarationContext,
		Map<PluginSchemaContributionOwner | undefined, GenericField>
	>
>

export interface PluginDeclarationFailureDiagnostic {
	readonly contributionId?: string
	readonly instanceId?: string
	readonly owners?: readonly string[]
	readonly path?: string
	readonly pluginId?: string
}

export class PluginDeclarationDiagnosticError extends TypeError {
	readonly diagnostic: PluginDeclarationFailureDiagnostic

	constructor(
		message: string,
		diagnostic: PluginDeclarationFailureDiagnostic,
		options?: ErrorOptions,
	) {
		super(message, options)
		this.name = 'PluginDeclarationDiagnosticError'
		this.diagnostic = immutableRecord(diagnostic)
	}
}

export const pluginDeclarationDiagnostic = (
	owner: PluginSchemaContributionOwner,
	path: string,
	contributionId?: string,
): PluginDeclarationFailureDiagnostic =>
	immutableRecord({
		...(contributionId === undefined ? {} : { contributionId }),
		...(owner.instanceId === undefined ? {} : { instanceId: owner.instanceId }),
		path,
		pluginId: owner.pluginId,
	})

export const attachPluginDeclarationDiagnostic = (
	cause: unknown,
	owner: PluginSchemaContributionOwner,
	path: string,
	contributionId?: string,
): PluginDeclarationDiagnosticError => {
	if (cause instanceof PluginDeclarationDiagnosticError) return cause

	return new PluginDeclarationDiagnosticError(
		cause instanceof Error
			? cause.message
			: 'Unknown plugin declaration failure',
		pluginDeclarationDiagnostic(owner, path, contributionId),
		{ cause },
	)
}

export const resolveOptionDefinition = (
	definitions: ReadonlyMap<string, readonly OwnedOptionDefinition[]>,
	name: string,
	path: string,
	preferredOwner?: PluginSchemaContributionOwner,
): OwnedOptionDefinition | undefined => {
	const candidates = definitions.get(name) ?? []
	if (candidates.length === 0) return undefined
	if (candidates.length === 1) return candidates[0]

	if (preferredOwner !== undefined) {
		const owned = candidates.filter((candidate) =>
			isSamePluginIdentity(candidate.owner, preferredOwner),
		)
		if (owned.length === 1) return owned[0]
	}

	const owners = immutableArray(
		candidates.map(({ owner }) =>
			owner.instanceId === undefined
				? owner.pluginId
				: `${owner.pluginId}#${owner.instanceId}`,
		),
	)
	throw new PluginDeclarationDiagnosticError(
		`Ambiguous ${candidates[0]?.scope ?? 'plugin'} option owner for "${name}": ${owners.join(' and ')}`,
		immutableRecord({ owners, path }),
	)
}

export interface PendingSchemaOptionRuntimeCompilation {
	readonly context: Omit<SchemaOptionRuntimeCompilationContext, 'capability'>
	readonly owner: PluginSchemaContributionOwner
	readonly runtime: SchemaOptionRuntimeCompiler
}

export interface OwnedSchemaSource {
	readonly contributionId: string
	readonly owner: PluginSchemaContributionOwner
	readonly schema: SchemaDefinition
	readonly staticOptions: Readonly<Record<string, JsonValue>>
}

export type OwnedSchemaAddition = OwnedSchemaSource
export type OwnedSchemaClaim = OwnedSchemaSource

export interface OwnedSchemaPatch {
	readonly operations: readonly SchemaPatchOperation[]
	readonly owner: PluginSchemaContributionOwner
	readonly staticOptions: Readonly<Record<string, JsonValue>>
	readonly targets: SchemaSelection
}

export interface SchemaDeclarationBatch {
	readonly additions: readonly OwnedSchemaAddition[]
	readonly canDeclare: boolean
	readonly claims: readonly OwnedSchemaClaim[]
	readonly options: readonly OwnedOptionDefinition[]
	readonly owner: PluginSchemaContributionOwner
	readonly patches: readonly OwnedSchemaPatch[]
	readonly surfaces: ApplicationSurfaceDeclarations
	readonly typegen: TypegenDeclarations
}

export interface MutableSchemaDeclarationBatch {
	readonly additions: OwnedSchemaAddition[]
	readonly canDeclare: boolean
	readonly claims: OwnedSchemaClaim[]
	readonly options: OwnedOptionDefinition[]
	readonly owner: PluginSchemaContributionOwner
	readonly patches: OwnedSchemaPatch[]
	readonly surfaces: {
		readonly modelSurfaces: ApplicationSurfaceDeclarations['modelSurfaces'][number][]
		readonly operations: ApplicationSurfaceDeclarations['operations'][number][]
	}
	readonly typegen: MutableTypegenDeclarations
}

/** Maps a terminal schema compilation failure back to its latest plugin owner. */
export const diagnosePluginDeclarationFailure = (
	error: unknown,
	compiledProvenance:
		ReadonlyMap<string, SchemaCompilationProvenance> | undefined,
	batches: readonly SchemaDeclarationBatch[],
): PluginDeclarationFailureDiagnostic => {
	if (error instanceof PluginDeclarationDiagnosticError) {
		return error.diagnostic
	}

	const className =
		isPlainRecord(error) && typeof error.className === 'string'
			? error.className
			: undefined
	if (className === undefined) return immutableRecord({})

	const provenance = compiledProvenance?.get(className)
	const latestPatch = provenance?.patches.at(-1)?.provenance
	const source =
		latestPatch ??
		(provenance?.schema.owner.kind === 'plugin' ? provenance.schema : undefined)
	if (source?.owner.kind === 'plugin') {
		return pluginDeclarationDiagnostic(
			source.owner,
			className,
			source.contributionId,
		)
	}

	for (const batch of batches) {
		const claim = batch.claims.find(
			(candidate) => candidate.schema.className === className,
		)
		if (claim !== undefined) {
			return pluginDeclarationDiagnostic(
				claim.owner,
				className,
				claim.contributionId,
			)
		}
		const addition = batch.additions.find(
			(candidate) => candidate.schema.className === className,
		)
		if (addition !== undefined) {
			return pluginDeclarationDiagnostic(
				addition.owner,
				className,
				addition.contributionId,
			)
		}
	}

	return immutableRecord({ path: className })
}

const emptyStaticOptions: Readonly<Record<string, JsonValue>> = immutableRecord(
	{},
)

export const snapshotStaticOptions = (
	options: Readonly<Record<string, JsonValue>> | undefined,
	path: string,
): Readonly<Record<string, JsonValue>> => {
	if (options === undefined) return emptyStaticOptions

	const snapshot = snapshotJsonValue(options, path)
	assertPlainObject(snapshot, `${path} must be a JSON object`)

	return snapshot
}
