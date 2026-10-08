import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type { JsonValue } from '../schema/fields/builtins/json.js'
import type { FieldDeclarationContext } from '../schema/schema/field-contexts.js'
import type { PluginSchemaContributionOwner } from '../schema/schema/provenance.js'
import type {
	CompiledSchemaSurfaceFacts,
	OperationCommandFacts,
} from './application-surface-contracts.js'
import type { CompiledCommandGraph } from './command-graph.js'
import type { SchemaDeclarationBatch } from './schema-declaration-contracts.js'
import {
	isTypegenReference,
	type TypegenReference,
} from './typegen-contracts.js'

export interface TypegenReferenceRegistrar {
	/** Authorizes one public type import for this plugin's generated contracts. */
	register(reference: TypegenReference): void
}

export interface OwnedTypegenReference {
	readonly owner: PluginSchemaContributionOwner
	readonly reference: TypegenReference
}

export interface TypegenDeclarations {
	readonly references: readonly OwnedTypegenReference[]
}

export interface CompiledTypegenOption {
	readonly contributionId: string
	readonly contexts?: readonly FieldDeclarationContext[]
	readonly name: string
	readonly owner: PluginSchemaContributionOwner
	readonly scope: 'field' | 'schema'
	readonly staticOptions: Readonly<Record<string, JsonValue>>
	readonly typegen: Readonly<{
		readonly compatibilityType?: string
		readonly generic?: 'self'
		readonly module: string
		readonly type: string
	}>
}

/** Describes the compiled graph without validators, executable tokens or constructors. */
export interface CompiledTypegenGraph {
	readonly declarations: readonly TypegenDeclarations[]
	readonly operations: readonly Readonly<{
		readonly operation: OperationCommandFacts
		readonly owner: PluginSchemaContributionOwner
	}>[]
	readonly options: readonly CompiledTypegenOption[]
	readonly schemaSurfaces: readonly CompiledSchemaSurfaceFacts[]
}

export interface MutableTypegenDeclarations {
	readonly references: OwnedTypegenReference[]
}

interface TypegenReferenceRegistration extends TypegenReferenceRegistrar {
	/** Adds a reference derived from an owned command without duplicating it. */
	registerReachable(reference: TypegenReference): void
}

/** Creates the owner-bound public type-reference registrar for one declaration batch. */
export const createTypegenReferenceRegistrar = (
	owner: PluginSchemaContributionOwner,
	declarations: MutableTypegenDeclarations,
	assertOpen: () => void,
): TypegenReferenceRegistration => {
	const manuallyRegistered = new Set<TypegenReference>()
	const reachableReferences = new Set<TypegenReference>()
	const append = (reference: TypegenReference): void => {
		declarations.references.push(immutableRecord({ owner, reference }))
	}
	const assertReference = (reference: TypegenReference): void => {
		if (!isTypegenReference(reference)) {
			throw new TypeError(
				'Typegen reference must be created by defineTypegenReference',
			)
		}
	}
	return immutableRecord({
		register: (reference): void => {
			assertOpen()
			assertReference(reference)
			if (manuallyRegistered.has(reference)) {
				throw new TypeError(
					'Typegen reference is already registered by this plugin',
				)
			}
			manuallyRegistered.add(reference)
			if (!reachableReferences.has(reference)) append(reference)
		},
		registerReachable: (reference): void => {
			assertOpen()
			assertReference(reference)
			if (
				manuallyRegistered.has(reference) ||
				reachableReferences.has(reference)
			) {
				return
			}
			reachableReferences.add(reference)
			append(reference)
		},
	})
}

export const snapshotTypegenDeclarations = (
	declarations: MutableTypegenDeclarations,
): TypegenDeclarations =>
	immutableRecord({
		references: immutableArray(declarations.references),
	})

/** Projects Typegen's inert view from the successfully compiled application graph. */
export const createCompiledTypegenGraph = (options: {
	readonly batches: readonly SchemaDeclarationBatch[]
	readonly commands: CompiledCommandGraph
}): CompiledTypegenGraph =>
	immutableRecord({
		declarations: immutableArray(options.batches.map(({ typegen }) => typegen)),
		operations: immutableArray(
			options.commands.commands.flatMap((command) =>
				command.kind === 'operation'
					? [
							immutableRecord({
								operation: command.definition,
								owner: command.owner,
							}),
						]
					: [],
			),
		),
		options: immutableArray(
			options.batches.flatMap(({ options: definitions }) =>
				definitions.flatMap((option) => {
					const typegen = option.definition.typegen

					return typegen === false
						? []
						: [
								immutableRecord({
									contributionId: option.contributionId,
									...(option.scope === 'field' &&
									'contexts' in option.definition
										? { contexts: option.definition.contexts }
										: {}),
									name: option.name,
									owner: option.owner,
									scope: option.scope,
									staticOptions: option.staticOptions,
									typegen,
								}),
							]
				}),
			),
		),
		schemaSurfaces: options.commands.schemaSurfaces(),
	})
