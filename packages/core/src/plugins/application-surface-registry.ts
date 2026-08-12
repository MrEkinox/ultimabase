import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type { SchemaDefinition } from '../schema/schema/definition.js'
import type { PluginSchemaContributionOwner } from '../schema/schema/provenance.js'
import type { SchemaRegistry } from '../schema/schema/registry.js'
import type { JsonValue } from '../schema/fields/builtins/json.js'
import type {
	ApplicationSurfaceDeclarations,
	QueryExtensionDefinition,
} from './application-surface-declarations.js'
import type { PluginOperationDefinition } from './plugin-operations.js'
import type { SchemaCompilerOutput } from './schema-compiler-ir/contracts.js'
import { attachPluginDeclarationDiagnostic } from './schema-declaration-contracts.js'

/** Records one operation together with the exact plugin that declared it. */
export interface CompiledPluginOperation {
	readonly operation: PluginOperationDefinition
	readonly owner: PluginSchemaContributionOwner
}

/** Records one command alias on an application-owned schema or model handle. */
export interface CompiledOperationCommand {
	readonly contributionId: string
	readonly operation: PluginOperationDefinition
	readonly owner: PluginSchemaContributionOwner
	readonly staticOptions: Readonly<Record<string, JsonValue>>
}

/** Records one query alias on an application-owned schema handle. */
export interface CompiledQueryExtension {
	readonly contributionId: string
	readonly extension: QueryExtensionDefinition
	readonly owner: PluginSchemaContributionOwner
	readonly staticOptions: Readonly<Record<string, JsonValue>>
}

/** Contains every final application-local surface for one schema identity. */
export interface CompiledApplicationSchemaSurface {
	readonly modelCommands: ReadonlyMap<string, CompiledOperationCommand>
	readonly queryExtensions: ReadonlyMap<string, CompiledQueryExtension>
	readonly schema: SchemaDefinition
	readonly schemaCommands: ReadonlyMap<string, CompiledOperationCommand>
}

const reservedSchemaHandleNames = new Set([
	'command',
	'commands',
	'for',
	'query',
	'queries',
	'schema',
])
const reservedModelHandleNames = new Set([
	'command',
	'commands',
	'model',
	'schema',
])

const addCommand = (
	target: Map<string, CompiledOperationCommand>,
	name: string,
	command: CompiledOperationCommand,
	reserved: ReadonlySet<string>,
	path: string,
): void => {
	if (reserved.has(name)) {
		throw new TypeError(`${path} uses reserved handle method: ${name}`)
	}
	if (target.has(name))
		throw new TypeError(`${path} contains duplicate command: ${name}`)
	target.set(name, immutableRecord(command))
}

/** Validates and publishes all non-executable operation and handle declarations. */
export const compileApplicationSurfaces = (
	declarations: readonly ApplicationSurfaceDeclarations[],
	output: SchemaCompilerOutput,
	registry: SchemaRegistry,
): Readonly<{
	operations: ReadonlyMap<string, CompiledPluginOperation>
	schemas: ReadonlyMap<string, CompiledApplicationSchemaSurface>
}> => {
	const operations = new Map<string, CompiledPluginOperation>()
	for (const declaration of declarations) {
		for (const owned of declaration.operations) {
			const prior = operations.get(owned.operation.name)
			if (prior !== undefined) {
				throw attachPluginDeclarationDiagnostic(
					new TypeError(
						`Duplicate plugin operation name: ${owned.operation.name}`,
					),
					owned.owner,
					`operations.${owned.operation.name}`,
				)
			}
			operations.set(owned.operation.name, immutableRecord(owned))
		}
	}

	const selectionTargets = new Map(
		output.selections.map(({ classNames, selectionId }) => [
			selectionId,
			classNames,
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
	const mutableSchemas = new Map<
		string,
		{
			modelCommands: Map<string, CompiledOperationCommand>
			queryExtensions: Map<string, CompiledQueryExtension>
			schema: SchemaDefinition
			schemaCommands: Map<string, CompiledOperationCommand>
		}
	>()
	for (const schema of registry.values()) {
		mutableSchemas.set(schema.className, {
			modelCommands: new Map(),
			queryExtensions: new Map(),
			schema,
			schemaCommands: new Map(),
		})
	}

	for (const declaration of declarations) {
		for (const surface of declaration.modelSurfaces) {
			try {
				for (const className of targetClassNames(surface.target)) {
					const target = mutableSchemas.get(className)
					if (target === undefined) {
						throw new TypeError(`Unknown model surface schema: ${className}`)
					}
					for (const [name, operation] of Object.entries(
						surface.schemaCommands,
					)) {
						if (operations.get(operation.name)?.operation !== operation) {
							throw new TypeError(
								`Schema command ${name} references an undeclared operation`,
							)
						}
						addCommand(
							target.schemaCommands,
							name,
							{
								contributionId: surface.contributionId,
								operation,
								owner: surface.owner,
								staticOptions: surface.staticOptions,
							},
							reservedSchemaHandleNames,
							`${className} schema surface`,
						)
					}
					for (const [name, operation] of Object.entries(
						surface.modelCommands,
					)) {
						if (operations.get(operation.name)?.operation !== operation) {
							throw new TypeError(
								`Model command ${name} references an undeclared operation`,
							)
						}
						addCommand(
							target.modelCommands,
							name,
							{
								contributionId: surface.contributionId,
								operation,
								owner: surface.owner,
								staticOptions: surface.staticOptions,
							},
							reservedModelHandleNames,
							`${className} model surface`,
						)
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

		for (const surface of declaration.querySurfaces) {
			try {
				for (const className of targetClassNames(surface.target)) {
					const target = mutableSchemas.get(className)
					if (target === undefined) {
						throw new TypeError(`Unknown query surface schema: ${className}`)
					}
					for (const [name, extension] of Object.entries(surface.extensions)) {
						if (reservedSchemaHandleNames.has(name)) {
							throw new TypeError(
								`${className} query surface uses reserved method: ${name}`,
							)
						}
						if (target.queryExtensions.has(name)) {
							throw new TypeError(
								`${className} query surface contains duplicate extension: ${name}`,
							)
						}
						target.queryExtensions.set(
							name,
							immutableRecord({
								contributionId: surface.contributionId,
								extension,
								owner: surface.owner,
								staticOptions: surface.staticOptions,
							}),
						)
					}
				}
			} catch (cause: unknown) {
				throw attachPluginDeclarationDiagnostic(
					cause,
					surface.owner,
					'queries',
					surface.contributionId,
				)
			}
		}
	}

	const schemas = new Map<string, CompiledApplicationSchemaSurface>()
	for (const [className, mutable] of mutableSchemas) {
		const surface = immutableRecord({
			modelCommands: new Map(mutable.modelCommands),
			queryExtensions: new Map(mutable.queryExtensions),
			schema: mutable.schema,
			schemaCommands: new Map(mutable.schemaCommands),
		})
		schemas.set(className, surface)
	}

	return immutableRecord({
		operations: new Map(operations),
		schemas: new Map(schemas),
	})
}
