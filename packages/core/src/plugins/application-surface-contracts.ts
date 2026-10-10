import type { JsonValue } from '../schema/fields/builtins/json.js'
import type { SchemaDefinition } from '../schema/schema/definition.js'
import type { PluginSchemaContributionOwner } from '../schema/schema/provenance.js'

import type { PluginOperationDefinition } from './plugin-operations.js'
import type { CompiledPluginSchemaMutationDefinition } from './plugin-schema-mutations.js'

/** Describes an operation without its executable input/result snapshotters. */
export type OperationCommandFacts = Omit<
	PluginOperationDefinition,
	'input' | 'result'
> & {
	readonly input: Omit<PluginOperationDefinition['input'], 'snapshot'>
	readonly result: Omit<PluginOperationDefinition['result'], 'snapshot'>
}

/** Records one operation together with the exact plugin that declared it. */
export interface CompiledPluginOperation {
	readonly operation: PluginOperationDefinition
	readonly owner: PluginSchemaContributionOwner
}

/** Records one direct schema-mutation command on selected application handles. */
export interface CompiledSchemaMutationCommand {
	readonly contributionId: string
	readonly mutation: CompiledPluginSchemaMutationDefinition
	readonly owner: PluginSchemaContributionOwner
	readonly staticOptions: Readonly<Record<string, JsonValue>>
}

/** Describes selected aliases without retaining a constructible schema. */
export interface CompiledSchemaSurfaceFacts {
	readonly schema: Readonly<{ readonly className: string }>
	readonly schemaMutations: ReadonlyMap<string, CompiledSchemaMutationCommand>
}

/** Binds the same aliases to the exact schema used by direct execution. */
export interface CompiledApplicationSchemaSurface extends CompiledSchemaSurfaceFacts {
	readonly schema: SchemaDefinition
}

/** Names Core commands that plugin direct schema surfaces cannot shadow. */
const coreSchemaCommandNames = [
	'count',
	'createMany',
	'createOne',
	'deleteMany',
	'deleteOne',
	'exists',
	'findMany',
	'findOne',
	'findOneOrThrow',
	'updateMany',
	'updateOne',
	'upsertMany',
	'upsertOne',
] as const

const dangerousObjectNames = ['__proto__', 'constructor', 'prototype', 'then']

/** @internal Protects schema handles and promise-like object behavior. */
export const reservedSchemaHandleNames: ReadonlySet<string> = new Set([
	...coreSchemaCommandNames,
	...dangerousObjectNames,
	'schema',
])
