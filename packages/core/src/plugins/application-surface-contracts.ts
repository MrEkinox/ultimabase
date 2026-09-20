import type { JsonValue } from '../schema/fields/builtins/json.js'
import type { SchemaDefinition } from '../schema/schema/definition.js'
import type { PluginSchemaContributionOwner } from '../schema/schema/provenance.js'
import { reservedSchemaModelFieldNames } from '../schema/schema/reserved-field-names.js'

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

/** Records one direct schema-mutation command on selected application handles. */
export interface CompiledSchemaMutationCommand {
	readonly contributionId: string
	readonly mutation: CompiledPluginSchemaMutationDefinition
	readonly owner: PluginSchemaContributionOwner
	readonly staticOptions: Readonly<Record<string, JsonValue>>
}

/** Contains every final application-local surface for one schema identity. */
export interface CompiledApplicationSchemaSurface {
	readonly modelMutations: ReadonlyMap<string, CompiledSchemaMutationCommand>
	readonly schema: SchemaDefinition
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
	'for',
	'schema',
])

/** @internal Protects model fields, commands, and object behavior. */
export const reservedModelHandleNames: ReadonlySet<string> = new Set([
	...dangerousObjectNames,
	...reservedSchemaModelFieldNames,
	'equals',
	'exists',
	'fetch',
	'model',
	'schema',
	'state',
	'toPointer',
])
