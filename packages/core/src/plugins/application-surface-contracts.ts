import { immutableRecord } from '@ultimabase/shared'

import type { JsonValue } from '../schema/fields/builtins/json.js'
import type { SchemaDefinition } from '../schema/schema/definition.js'
import { reservedSchemaModelFieldNames } from '../schema/schema/reserved-field-names.js'
import type { PluginSchemaContributionOwner } from '../schema/schema/provenance.js'
import type { QueryExtensionDefinition } from './application-surface-declarations.js'
import type { PluginOperationDefinition } from './plugin-operations.js'
import type { CompiledPluginSchemaMutationDefinition } from './plugin-schema-mutations.js'

/** Records one operation together with the exact plugin that declared it. */
export interface CompiledPluginOperation {
	readonly operation: PluginOperationDefinition
	readonly owner: PluginSchemaContributionOwner
}

/** Records one callback-free schema mutation with its exact declaring owner. */
export interface CompiledPluginSchemaMutation {
	readonly mutation: CompiledPluginSchemaMutationDefinition
	readonly owner: PluginSchemaContributionOwner
}

/** Records one command alias on an application-owned schema or model handle. */
export interface CompiledOperationCommand {
	readonly contributionId: string
	readonly operation: PluginOperationDefinition
	readonly owner: PluginSchemaContributionOwner
	readonly staticOptions: Readonly<Record<string, JsonValue>>
}

/** Records one direct schema-mutation command on selected application handles. */
export interface CompiledSchemaMutationCommand {
	readonly contributionId: string
	readonly mutation: CompiledPluginSchemaMutationDefinition
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
	readonly modelMutations: ReadonlyMap<string, CompiledSchemaMutationCommand>
	readonly queryExtensions: ReadonlyMap<string, CompiledQueryExtension>
	readonly schema: SchemaDefinition
	readonly schemaCommands: ReadonlyMap<string, CompiledOperationCommand>
	readonly schemaMutations: ReadonlyMap<string, CompiledSchemaMutationCommand>
}

/** Names Core commands that plugin direct schema surfaces cannot shadow. */
export const coreSchemaHandleCommandNames = [
	'count',
	'createMany',
	'createOne',
	'deleteMany',
	'deleteOne',
	'exists',
	'findMany',
	'findOne',
	'get',
	'updateMany',
	'updateOne',
	'upsertMany',
	'upsertOne',
] as const

const dangerousObjectNames = ['__proto__', 'constructor', 'prototype', 'then']

/** @internal Protects schema handles and promise-like object behavior. */
export const reservedSchemaHandleNames: ReadonlySet<string> = new Set([
	...coreSchemaHandleCommandNames,
	...dangerousObjectNames,
	'command',
	'commands',
	'for',
	'query',
	'queries',
	'schema',
])

/** @internal Protects model fields, commands, and object behavior. */
export const reservedModelHandleNames: ReadonlySet<string> = new Set([
	...dangerousObjectNames,
	...reservedSchemaModelFieldNames,
	'command',
	'commands',
	'equals',
	'exists',
	'fetch',
	'model',
	'schema',
	'state',
	'toPointer',
])

/** @internal Adds one collision-checked arbitrary operation command. */
export const addOperationCommand = (
	target: Map<string, CompiledOperationCommand>,
	name: string,
	command: CompiledOperationCommand,
	reserved: ReadonlySet<string>,
	path: string,
): void => {
	if (reserved.has(name)) {
		throw new TypeError(`${path} uses reserved handle method: ${name}`)
	}
	if (target.has(name)) {
		throw new TypeError(`${path} contains duplicate command: ${name}`)
	}
	target.set(name, immutableRecord(command))
}
