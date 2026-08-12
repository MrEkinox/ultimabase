import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import type { JsonValue } from '../schema/fields/builtins/json.js'

import { snapshotJsonValue } from '../schema/fields/builtins/json.js'

import type { GenericField } from '../schema/fields/base/contract.js'

import type { SchemaDefinition } from '../schema/schema/definition.js'

import {
	type PluginSchemaContributionOwner,
	type SchemaCompilationProvenance,
} from '../schema/schema/provenance.js'

import {
	type SchemaOptionDefinition,
	type SchemaOptionRuntimeCompilationContext,
	type SchemaOptionRuntimeCompiler,
} from './schema-option-definitions.js'

import {
	type SchemaPatchOperation,
	type SchemaSelection,
	type SchemaSelectorOptions,
} from './schema-patch-contracts.js'

export interface PluginSchemaDeclarationRegistrar {
	add(options: {
		readonly contributionId: string
		readonly schema: SchemaDefinition
		readonly staticOptions?: Readonly<Record<string, JsonValue>>
	}): void
	defineOptions(options: {
		readonly contributionId: string
		readonly field?: Readonly<Record<string, SchemaOptionDefinition>>
		readonly schema?: Readonly<Record<string, SchemaOptionDefinition>>
		readonly staticOptions?: Readonly<Record<string, JsonValue>>
	}): void
	patch(options: {
		readonly operations: readonly SchemaPatchOperation[]
		readonly staticOptions?: Readonly<Record<string, JsonValue>>
		readonly targets: SchemaSelection
	}): void
	select(selector: SchemaSelectorOptions): SchemaSelection
}

export interface OwnedOptionDefinition {
	readonly contributionId: string
	readonly definition: SchemaOptionDefinition
	readonly name: string
	readonly owner: PluginSchemaContributionOwner
	readonly scope: 'field' | 'schema'
	readonly staticOptions: Readonly<Record<string, JsonValue>>
}

export interface OptionDefinitionIndex {
	readonly field: ReadonlyMap<string, readonly OwnedOptionDefinition[]>
	readonly schema: ReadonlyMap<string, readonly OwnedOptionDefinition[]>
}

export type ResolvedFieldOptions = WeakMap<
	object,
	Map<PluginSchemaContributionOwner | undefined, GenericField>
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

export const samePluginOwner = (
	left: PluginSchemaContributionOwner,
	right: PluginSchemaContributionOwner,
): boolean =>
	left.pluginId === right.pluginId && left.instanceId === right.instanceId

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
			samePluginOwner(candidate.owner, preferredOwner),
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
	readonly context: Omit<
		SchemaOptionRuntimeCompilationContext<JsonValue>,
		'capability'
	>
	readonly owner: PluginSchemaContributionOwner
	readonly runtime: SchemaOptionRuntimeCompiler
}

export interface OwnedSchemaAddition {
	readonly contributionId: string
	readonly owner: PluginSchemaContributionOwner
	readonly schema: SchemaDefinition
	readonly staticOptions: Readonly<Record<string, JsonValue>>
}

export interface OwnedSchemaPatch {
	readonly operations: readonly SchemaPatchOperation[]
	readonly owner: PluginSchemaContributionOwner
	readonly staticOptions: Readonly<Record<string, JsonValue>>
	readonly targets: SchemaSelection
}

export interface SchemaDeclarationBatch {
	readonly additions: readonly OwnedSchemaAddition[]
	readonly canDeclare: boolean
	readonly canTransform: boolean
	readonly options: readonly OwnedOptionDefinition[]
	readonly owner: PluginSchemaContributionOwner
	readonly patches: readonly OwnedSchemaPatch[]
}

export interface MutableSchemaDeclarationBatch {
	readonly additions: OwnedSchemaAddition[]
	readonly canDeclare: boolean
	readonly canTransform: boolean
	readonly options: OwnedOptionDefinition[]
	readonly owner: PluginSchemaContributionOwner
	readonly patches: OwnedSchemaPatch[]
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
	if (!isPlainRecord(snapshot)) {
		throw new TypeError(`${path} must be a JSON object`)
	}

	return snapshot
}
