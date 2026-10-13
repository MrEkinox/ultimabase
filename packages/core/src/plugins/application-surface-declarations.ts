import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
} from '@ultimabase/shared'

import { assertExactEnumerablePlainObject } from '../exact-object-validation.js'

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
import type { PluginSourceReceipt } from './source-projections.js'
import { pluginSourceReceipt } from './source-projections.js'
import type {
	SchemaSelection,
	SchemaSelectorOptions,
} from './schema-patch-contracts.js'

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
	/**
	 * Adds schema-mutation methods to selected schemas and schema handles; the
	 * receipt projects no type: a statics slot types the commands (ADR-0316).
	 */
	extend(
		target: SchemaDefinition | SchemaSelectorOptions,
		options: {
			readonly contributionId: string
			readonly schemaMutations?: Readonly<
				Record<string, PluginSchemaMutationSurfaceBinding>
			>
			readonly staticOptions?: Readonly<Record<string, JsonValue>>
		},
	): PluginSourceReceipt<never>
}

type OperationSourceProjection<TOperation> =
	TOperation extends PluginOperationDefinition<infer TName>
		? Readonly<{
				operations: Readonly<Record<TName, TOperation>>
			}>
		: Readonly<Record<never, never>>

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
				// Removed command maps must fail for JavaScript callers instead of becoming inert options.
				assertExactEnumerablePlainObject(
					options,
					new Set(['contributionId', 'schemaMutations', 'staticOptions']),
					'model surface must be a plain object',
					'model surface contains unknown option: ',
				)
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
