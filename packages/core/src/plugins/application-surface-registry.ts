import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type { SchemaDefinition } from '../schema/schema/definition.js'
import type { SchemaRegistry } from '../schema/schema/registry.js'
import {
	reservedModelHandleNames,
	reservedSchemaHandleNames,
	type CompiledApplicationSchemaSurface,
	type CompiledPluginOperation,
	type CompiledPluginSchemaMutation,
	type CompiledSchemaMutationCommand,
} from './application-surface-contracts.js'
import type { ApplicationSurfaceDeclarations } from './application-surface-declarations.js'
import {
	compilePluginSchemaMutationDefinition,
	type CompiledPluginSchemaMutationDefinition,
	type PluginSchemaMutationDefinition,
} from './plugin-schema-mutations.js'
import type {
	SchemaCompilerOutput,
	SchemaCompilerSchemaNode,
} from './schema-compiler-ir/contracts.js'
import {
	attachPluginDeclarationDiagnostic,
	samePluginOwner,
} from './schema-declaration-contracts.js'
export { coreSchemaHandleCommandNames } from './application-surface-contracts.js'
export type {
	CompiledApplicationSchemaSurface,
	CompiledPluginOperation,
	CompiledPluginSchemaMutation,
	CompiledSchemaMutationCommand,
} from './application-surface-contracts.js'

interface MutableApplicationSchemaSurface {
	readonly modelMutations: Map<string, CompiledSchemaMutationCommand>
	readonly schema: SchemaDefinition
	readonly schemaMutations: Map<string, CompiledSchemaMutationCommand>
}

const hasMutationName = (
	surface: MutableApplicationSchemaSurface,
	name: string,
): boolean =>
	surface.modelMutations.has(name) || surface.schemaMutations.has(name)

const assertMutationSelection = (
	name: string,
	mutation: CompiledPluginSchemaMutationDefinition,
	schema: SchemaCompilerSchemaNode,
): void => {
	for (const fieldName of Object.keys(mutation.select)) {
		const field = schema.fields.find(
			({ name: candidate }) => candidate === fieldName,
		)
		if (field === undefined || field.kind === 'relation') {
			throw new TypeError(
				`Schema mutation ${name} selects unavailable persisted field: ${fieldName}`,
			)
		}
	}
}

/** Validates and publishes all non-executable operation and handle declarations. */
export const compileApplicationSurfaces = (
	declarations: readonly ApplicationSurfaceDeclarations[],
	output: SchemaCompilerOutput,
	registry: SchemaRegistry,
): Readonly<{
	operations: ReadonlyMap<string, CompiledPluginOperation>
	schemaMutations: ReadonlyMap<string, CompiledPluginSchemaMutation>
	schemas: ReadonlyMap<string, CompiledApplicationSchemaSurface>
}> => {
	const operations = new Map<string, CompiledPluginOperation>()
	const schemaMutations = new Map<string, CompiledPluginSchemaMutation>()
	const sources = new Map<string, PluginSchemaMutationDefinition>()
	for (const declaration of declarations) {
		for (const owned of declaration.operations) {
			const name = owned.operation.name
			if (operations.has(name) || schemaMutations.has(name)) {
				throw attachPluginDeclarationDiagnostic(
					new TypeError(`Duplicate plugin operation name: ${name}`),
					owned.owner,
					`operations.${name}`,
				)
			}
			if (owned.operation.kind === 'plugin-schema-mutation') {
				const mutation = compilePluginSchemaMutationDefinition(owned.operation)
				schemaMutations.set(
					name,
					immutableRecord({ mutation, owner: owned.owner }),
				)
				sources.set(name, owned.operation)
			} else {
				operations.set(
					name,
					immutableRecord({ operation: owned.operation, owner: owned.owner }),
				)
			}
		}
	}

	const selectionTargets = new Map(
		output.selections.map(({ classNames, selectionId }) => [
			selectionId,
			classNames,
		]),
	)
	const outputSchemas = new Map(
		output.schemas.map((schema) => [schema.className, schema]),
	)
	const targetClassNames = (
		target: ApplicationSurfaceDeclarations['modelSurfaces'][number]['target'],
	): readonly string[] => {
		if (target.kind === 'selection') {
			return selectionTargets.get(target.selection.selectionId) ?? []
		}
		const registered = registry.get(target.schema.className)
		if (registered !== target.schema) {
			throw new TypeError(
				`Direct application surface schema is not registered: ${target.schema.className}`,
			)
		}
		return immutableArray([target.schema.className])
	}
	const mutableSchemas = new Map<string, MutableApplicationSchemaSurface>()
	for (const schema of registry.values()) {
		mutableSchemas.set(schema.className, {
			modelMutations: new Map(),
			schema,
			schemaMutations: new Map(),
		})
	}

	const mutationContributionIds = new Set<string>()
	for (const declaration of declarations) {
		for (const surface of declaration.modelSurfaces) {
			try {
				if (Object.keys(surface.schemaMutations).length > 0) {
					const contributionKey = `${surface.owner.pluginId}\u0000${surface.owner.instanceId ?? ''}\u0000${surface.contributionId}`
					if (mutationContributionIds.has(contributionKey)) {
						throw new TypeError(
							`Duplicate schema mutation contributionId: ${surface.contributionId}`,
						)
					}
					mutationContributionIds.add(contributionKey)
				}
				for (const className of targetClassNames(surface.target)) {
					const target = mutableSchemas.get(className)
					if (target === undefined) {
						throw new TypeError(`Unknown model surface schema: ${className}`)
					}
					const outputSchema = outputSchemas.get(className)
					if (outputSchema === undefined) {
						throw new TypeError(
							`Missing compiled model surface schema: ${className}`,
						)
					}
					const fieldNames = new Set([
						...outputSchema.fields.map(({ name }) => name),
						...outputSchema.virtualFields.map(({ name }) => name),
					])
					for (const [name, binding] of Object.entries(
						surface.schemaMutations,
					)) {
						const compiled = schemaMutations.get(binding.mutation.name)
						if (
							compiled === undefined ||
							sources.get(binding.mutation.name) !== binding.mutation
						) {
							throw new TypeError(
								`Schema mutation ${name} references an undeclared mutation`,
							)
						}
						if (!samePluginOwner(compiled.owner, surface.owner)) {
							throw new TypeError(
								`Schema mutation ${name} must be attached by its declaring owner`,
							)
						}
						if (hasMutationName(target, name)) {
							throw new TypeError(
								`${className} surface contains duplicate command: ${name}`,
							)
						}
						assertMutationSelection(name, compiled.mutation, outputSchema)
						const command = immutableRecord({
							contributionId: surface.contributionId,
							mutation: compiled.mutation,
							owner: surface.owner,
							staticOptions: surface.staticOptions,
						})
						for (const mutationSurface of binding.surfaces) {
							if (mutationSurface === 'schema') {
								if (reservedSchemaHandleNames.has(name)) {
									throw new TypeError(
										`${className} schema mutation uses reserved handle method: ${name}`,
									)
								}
								target.schemaMutations.set(name, command)
							} else {
								if (
									reservedModelHandleNames.has(name) ||
									fieldNames.has(name)
								) {
									throw new TypeError(
										`${className} model mutation uses reserved handle method: ${name}`,
									)
								}
								target.modelMutations.set(name, command)
							}
						}
					}
				}
			} catch (cause: unknown) {
				throw attachPluginDeclarationDiagnostic(
					cause,
					surface.owner,
					'models',
					surface.contributionId,
				)
			}
		}
	}

	const schemas = new Map<string, CompiledApplicationSchemaSurface>()
	for (const [className, mutable] of mutableSchemas) {
		schemas.set(
			className,
			immutableRecord({
				modelMutations: new Map(mutable.modelMutations),
				schema: mutable.schema,
				schemaMutations: new Map(mutable.schemaMutations),
			}),
		)
	}

	return immutableRecord({
		operations: new Map(operations),
		schemaMutations: new Map(schemaMutations),
		schemas: new Map(schemas),
	})
}
