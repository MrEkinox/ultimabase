import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import type { JsonValue } from '../schema/fields/builtins/json.js'
import { Schema, type SchemaDefinition } from '../schema/schema/definition.js'
import type { PluginSchemaContributionOwner } from '../schema/schema/provenance.js'
import type { PluginOperationDefinition } from './plugin-operations.js'
import { isPluginOperationDefinition } from './plugin-operations.js'
import {
	isPluginSchemaMutationDefinition,
	type PluginSchemaMutationDefinition,
} from './plugin-schema-mutations.js'
import { snapshotStaticOptions } from './schema-declaration-contracts.js'
import {
	snapshotSchemaMutationMap,
	type PluginSchemaMutationSurfaceBinding,
} from './schema-mutation-surface-declarations.js'
import type {
	PluginSourceMutationMethod,
	PluginSourceReceipt,
	PluginSourceSchemaMutationCarrier,
	PluginSourceSchemaProjection,
} from './source-projections.js'
import { pluginSourceReceipt } from './source-projections.js'
import type {
	SchemaSelection,
	SchemaSelectorOptions,
} from './schema-patch-contracts.js'
export type {
	PluginSchemaMutationSurface,
	PluginSchemaMutationSurfaceBinding,
} from './schema-mutation-surface-declarations.js'

export interface PluginOperationDeclarationRegistrar {
	/** Declares one operation or schema-mutation token without installing a handler. */
	declare<
		const TOperation extends
			PluginOperationDefinition | PluginSchemaMutationDefinition,
	>(
		operation: TOperation,
	): PluginSourceReceipt<OperationSourceProjection<TOperation>>
}

export interface PluginModelSurfaceRegistrar {
	/** Adds schema-mutation methods to selected schema and model handles. */
	extend<
		const TTarget extends SchemaDefinition | SchemaSelectorOptions,
		const TMutations extends Readonly<
			Record<string, PluginSchemaMutationSurfaceBinding>
		> = Readonly<Record<never, never>>,
	>(
		target: TTarget,
		options: {
			readonly contributionId: string
			readonly schemaMutations?: TMutations
			readonly staticOptions?: Readonly<Record<string, JsonValue>>
		},
	): PluginSourceReceipt<PluginModelSurfaceSource<TTarget, TMutations>>
}

type OperationSourceProjection<TOperation> =
	TOperation extends PluginOperationDefinition<infer TName>
		? Readonly<{
				operations: Readonly<Record<TName, TOperation>>
			}>
		: Readonly<Record<never, never>>

type SurfaceMutationTemplate<
	TMutations extends Readonly<
		Record<string, PluginSchemaMutationSurfaceBinding>
	>,
	TSurface extends 'model' | 'schema',
> = {
	readonly [
		TName in keyof TMutations as TSurface extends TMutations[TName]['surfaces'][number]
			? TName
			: never
	]: PluginSourceMutationMethod<TMutations[TName]['mutation'], TSurface>
} & (TSurface extends 'schema'
	? PluginSourceSchemaMutationCarrier<{
			readonly [
				TName in keyof TMutations as TSurface extends TMutations[TName]['surfaces'][number]
					? TName
					: never
			]: TMutations[TName]['mutation']
		}>
	: object)

type TargetClassNames<TTarget> =
	TTarget extends SchemaDefinition<infer TClassName>
		? readonly [TClassName]
		: TTarget extends Readonly<{ className: infer TClassName extends string }>
			? readonly [TClassName]
			: undefined

type TargetSelector<TTarget> = TTarget extends SchemaSelectorOptions
	? TTarget extends Readonly<{ className: string }>
		? undefined
		: TTarget
	: undefined

type SurfaceProjection<
	TTarget,
	TMutations extends Readonly<
		Record<string, PluginSchemaMutationSurfaceBinding>
	>,
	TSurface extends 'model' | 'schema',
> = keyof SurfaceMutationTemplate<TMutations, TSurface> extends never
	? never
	: PluginSourceSchemaProjection<
			SurfaceMutationTemplate<TMutations, TSurface>,
			TargetClassNames<TTarget>,
			TargetSelector<TTarget>
		>

/** Derives source methods and mutation identity from one model-surface declaration. */
export type PluginModelSurfaceSource<
	TTarget,
	TMutations extends Readonly<
		Record<string, PluginSchemaMutationSurfaceBinding>
	>,
> =
	| (SurfaceProjection<
			TTarget,
			TMutations,
			'schema'
	  > extends infer TProjection extends PluginSourceSchemaProjection
			? Readonly<{ schemaClass: TProjection }>
			: never)
	| (SurfaceProjection<
			TTarget,
			TMutations,
			'model'
	  > extends infer TProjection extends PluginSourceSchemaProjection
			? Readonly<{ model: TProjection }>
			: never)

export interface OwnedPluginOperationDeclaration {
	readonly operation: PluginOperationDefinition | PluginSchemaMutationDefinition
	readonly owner: PluginSchemaContributionOwner
}

export interface OwnedModelSurfaceDeclaration {
	readonly contributionId: string
	readonly owner: PluginSchemaContributionOwner
	readonly schemaMutations: Readonly<
		Record<string, PluginSchemaMutationSurfaceBinding>
	>
	readonly staticOptions: Readonly<Record<string, JsonValue>>
	readonly target: ApplicationSurfaceTarget
}

/** Distinguishes exact owned schema identity from an ordered frozen selector. */
export type ApplicationSurfaceTarget =
	| Readonly<{ readonly kind: 'schema'; readonly schema: SchemaDefinition }>
	| Readonly<{
			readonly kind: 'selection'
			readonly selection: SchemaSelection
	  }>

export interface MutableApplicationSurfaceDeclarations {
	readonly modelSurfaces: OwnedModelSurfaceDeclaration[]
	readonly operations: OwnedPluginOperationDeclaration[]
}

export interface ApplicationSurfaceDeclarations {
	readonly modelSurfaces: readonly OwnedModelSurfaceDeclaration[]
	readonly operations: readonly OwnedPluginOperationDeclaration[]
}

/** Creates privilege-scoped registrars over one still-transactional plugin batch. */
export const createApplicationSurfaceRegistrars = (
	owner: PluginSchemaContributionOwner,
	declarations: MutableApplicationSurfaceDeclarations,
	createSelection: (selector: SchemaSelectorOptions) => SchemaSelection,
): Readonly<{
	models: PluginModelSurfaceRegistrar
	operations: PluginOperationDeclarationRegistrar
}> => {
	const createTarget = (
		target: SchemaDefinition | SchemaSelectorOptions,
	): ApplicationSurfaceTarget =>
		Schema.is(target)
			? immutableRecord({ kind: 'schema' as const, schema: target })
			: immutableRecord({
					kind: 'selection' as const,
					selection: createSelection(target),
				})

	return immutableRecord({
		models: immutableRecord({
			extend: (target, options) => {
				if (!isPlainRecord(options)) {
					throw new TypeError('model surface must be a plain object')
				}
				// Removed command maps must fail for JavaScript callers instead of becoming inert options.
				for (const key of Object.keys(options)) {
					if (
						key !== 'contributionId' &&
						key !== 'schemaMutations' &&
						key !== 'staticOptions'
					) {
						throw new TypeError(`model surface contains unknown option: ${key}`)
					}
				}
				assertNonEmptyString(
					options.contributionId,
					'model surface contributionId',
				)
				const schemaMutations = snapshotSchemaMutationMap(
					options.schemaMutations,
				)
				if (Object.keys(schemaMutations).length === 0) {
					throw new TypeError('model surface must declare at least one command')
				}
				declarations.modelSurfaces.push(
					immutableRecord({
						contributionId: options.contributionId,
						owner,
						schemaMutations,
						staticOptions: snapshotStaticOptions(
							options.staticOptions,
							'model surface staticOptions',
						),
						target: createTarget(target),
					}),
				)
				return pluginSourceReceipt()
			},
		}),
		operations: immutableRecord({
			declare: (operation) => {
				if (
					!isPluginOperationDefinition(operation) &&
					!isPluginSchemaMutationDefinition(operation)
				) {
					throw new TypeError(
						'operation must be created by defineOperation or defineSchemaMutation',
					)
				}
				declarations.operations.push(immutableRecord({ operation, owner }))
				return pluginSourceReceipt()
			},
		}),
	})
}

export const snapshotApplicationSurfaceDeclarations = (
	declarations: MutableApplicationSurfaceDeclarations,
): ApplicationSurfaceDeclarations =>
	immutableRecord({
		modelSurfaces: immutableArray(declarations.modelSurfaces),
		operations: immutableArray(declarations.operations),
	})
