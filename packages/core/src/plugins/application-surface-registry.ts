import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type { SchemaRegistry } from '../schema/schema/registry.js'
import {
	reservedModelHandleNames,
	reservedSchemaHandleNames,
} from './application-surface-contracts.js'
import {
	CompiledCommandGraph,
	type CommandEntry,
	type CommandSurface,
} from './command-graph.js'
import type { ApplicationSurfaceDeclarations } from './application-surface-declarations.js'
import {
	compilePluginSchemaMutationDefinition,
	type CompiledPluginSchemaMutationDefinition,
} from './plugin-schema-mutations.js'
import type { SchemaMetadata } from '../schema/schema/definition.js'
import type { SchemaCompilationResult } from './schema-compilation/contracts.js'
import {
	attachPluginDeclarationDiagnostic,
	samePluginOwner,
} from './schema-declaration-contracts.js'
export type {
	CompiledApplicationSchemaSurface,
	CompiledPluginOperation,
	CompiledSchemaMutationCommand,
} from './application-surface-contracts.js'

const assertMutationSelection = (
	name: string,
	mutation: CompiledPluginSchemaMutationDefinition,
	schema: SchemaMetadata,
): void => {
	for (const fieldName of Object.keys(mutation.select)) {
		const field = Object.hasOwn(schema.persistedFields, fieldName)
			? schema.persistedFields[fieldName]
			: undefined
		if (field === undefined || field.kind === 'relation') {
			throw new TypeError(
				`Schema mutation ${name} selects unavailable persisted field: ${fieldName}`,
			)
		}
	}
}

/** Compiles one immutable command graph before any schema state is published. */
export const compileCommandGraph = (
	declarations: readonly ApplicationSurfaceDeclarations[],
	output: SchemaCompilationResult,
	registry: SchemaRegistry,
): CompiledCommandGraph => {
	const entries = new Map<string, CommandEntry>()
	const surfaces = new Map<string, CommandSurface[]>()
	for (const declaration of declarations) {
		for (const owned of declaration.operations) {
			const source = owned.operation
			const name = source.name
			if (entries.has(name)) {
				throw attachPluginDeclarationDiagnostic(
					new TypeError(`Duplicate plugin operation name: ${name}`),
					owned.owner,
					`operations.${name}`,
				)
			}
			const command =
				source.kind === 'plugin-schema-mutation'
					? immutableRecord({
							kind: 'mutation' as const,
							definition: compilePluginSchemaMutationDefinition(source),
							owner: owned.owner,
							surfaces: immutableArray<readonly CommandSurface[]>([]),
						})
					: immutableRecord({
							kind: 'operation' as const,
							definition: immutableRecord({
								...source,
								input: immutableRecord({
									...(source.input.typegen === undefined
										? {}
										: { typegen: source.input.typegen }),
								}),
								result: immutableRecord({
									...(source.result.typegen === undefined
										? {}
										: { typegen: source.result.typegen }),
								}),
							}),
							owner: owned.owner,
						})
			entries.set(name, { command, source })
		}
	}

	const selectionTargets = new Map(
		output.selections.map(({ classNames, selectionId }) => [
			selectionId,
			classNames,
		]),
	)
	const outputSchemas = new Map(
		output.candidates.map(({ definition }) => [
			definition.className,
			definition,
		]),
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
	const schemaAliases = new Map<string, Set<string>>()

	const mutationContributionIds = new Set<string>()
	let nextSurfaceOrder = 0
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
					const target = registry.get(className)
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
						...Object.keys(outputSchema.persistedFields),
						...Object.keys(outputSchema.virtualFields),
					])
					for (const [name, binding] of Object.entries(
						surface.schemaMutations,
					)) {
						const entry = entries.get(binding.mutation.name)
						const compiled = entry?.command
						if (
							compiled?.kind !== 'mutation' ||
							entry?.source !== binding.mutation
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
						const aliases = schemaAliases.get(className) ?? new Set<string>()
						if (aliases.has(name)) {
							throw new TypeError(
								`${className} surface contains duplicate command: ${name}`,
							)
						}
						aliases.add(name)
						schemaAliases.set(className, aliases)
						assertMutationSelection(name, compiled.definition, outputSchema)
						const selected = surfaces.get(binding.mutation.name) ?? []
						selected.push(
							immutableRecord({
								className,
								order: nextSurfaceOrder++,
								contributionId: surface.contributionId,
								name,
								staticOptions: surface.staticOptions,
								surfaces: binding.surfaces,
							}),
						)
						surfaces.set(binding.mutation.name, selected)
						for (const mutationSurface of binding.surfaces) {
							if (mutationSurface === 'schema') {
								if (reservedSchemaHandleNames.has(name)) {
									throw new TypeError(
										`${className} schema mutation uses reserved handle method: ${name}`,
									)
								}
							} else {
								if (
									reservedModelHandleNames.has(name) ||
									fieldNames.has(name)
								) {
									throw new TypeError(
										`${className} model mutation uses reserved handle method: ${name}`,
									)
								}
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

	return new CompiledCommandGraph(
		[...entries.values()].map(({ command, source }) =>
			immutableRecord({
				command:
					command.kind === 'mutation'
						? immutableRecord({
								...command,
								surfaces: immutableArray(
									surfaces.get(command.definition.name) ?? [],
								),
							})
						: command,
				source,
			}),
		),
		[...registry.values()],
	)
}
