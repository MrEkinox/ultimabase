import type {
	CompiledSchemaRegistry,
	SchemaContributionOwner,
	SchemaDefinition,
} from '@ultimabase/core'

import { GraphqlSchemaCompilationError } from './errors.js'
import type { GraphqlNameRegistry } from './names.js'
import {
	readGraphqlSchemaExposure,
	type GraphqlBulkOperations,
	type GraphqlSchemaExposureOption,
	type GraphqlSchemaOperations,
} from './options.js'

type GeneratedOperation = Exclude<keyof GraphqlSchemaOperations, 'bulk'>
type BulkOperation = keyof GraphqlBulkOperations

export interface GraphqlSchemaSurface {
	readonly schema: SchemaDefinition
	readonly typeName: string
	readonly owner: SchemaContributionOwner
	readonly get: boolean
}

const builtInOperationDefaults: Readonly<Record<GeneratedOperation, boolean>> =
	{
		count: false,
		create: true,
		delete: true,
		exists: true,
		findMany: true,
		findOne: true,
		get: true,
		update: true,
		upsert: false,
	}

const directOperations = (
	value: GraphqlSchemaExposureOption | undefined,
): boolean | GraphqlSchemaOperations | undefined =>
	typeof value === 'boolean' ? value : value?.operations

const readOperation = (
	value: boolean | GraphqlSchemaOperations | undefined,
	operation: GeneratedOperation,
): boolean | undefined =>
	typeof value === 'boolean' ? value : value?.[operation]

const readBulkOperation = (
	value: boolean | GraphqlSchemaOperations | undefined,
	operation: BulkOperation,
): boolean | undefined => {
	if (typeof value === 'boolean') return value
	const bulk = value?.bulk
	return typeof bulk === 'boolean' ? bulk : bulk?.[operation]
}

/** Resolves one operation through schema, plugin, then built-in defaults. */
export const resolveGraphqlSchemaOperation = (
	direct: GraphqlSchemaExposureOption | undefined,
	pluginDefault: boolean | GraphqlSchemaOperations | undefined,
	operation: GeneratedOperation,
): boolean =>
	readOperation(directOperations(direct), operation) ??
	readOperation(pluginDefault, operation) ??
	builtInOperationDefaults[operation]

/** Resolves one bulk operation through schema, plugin, then disabled default. */
export const resolveGraphqlBulkOperation = (
	direct: GraphqlSchemaExposureOption | undefined,
	pluginDefault: boolean | GraphqlSchemaOperations | undefined,
	operation: BulkOperation,
): boolean =>
	readBulkOperation(directOperations(direct), operation) ??
	readBulkOperation(pluginDefault, operation) ??
	false

export const graphqlSourceDescription = (
	schema: SchemaDefinition,
	path?: readonly string[],
): string =>
	path === undefined
		? `schema ${schema.className}`
		: `field ${schema.className}.${path.join('.')}`

/** Resolves GraphQL identities and public get roots from final provenance. */
export const collectGraphqlSchemaSurfaces = (
	schemas: CompiledSchemaRegistry,
	pluginDefault: boolean | GraphqlSchemaOperations | undefined,
	names: GraphqlNameRegistry,
): ReadonlyMap<SchemaDefinition, GraphqlSchemaSurface> => {
	const surfaces = new Map<SchemaDefinition, GraphqlSchemaSurface>()
	for (const schema of schemas.values()) {
		const owner = schema.definition.provenance.schema.owner
		const direct = readGraphqlSchemaExposure(schema)
		if (owner.kind === 'plugin' && direct !== undefined) {
			throw new GraphqlSchemaCompilationError(
				'plugin-schema-option',
				`Plugin-owned schema ${schema.className} cannot declare the direct graphql option`,
				{ owner, path: schema.className },
			)
		}
		const typeName =
			typeof direct === 'object' && direct.typeName !== undefined
				? direct.typeName
				: schema.className
		names.claimType(typeName, {
			description: graphqlSourceDescription(schema),
			owner,
		})
		surfaces.set(schema, {
			get:
				owner.kind === 'application' &&
				resolveGraphqlSchemaOperation(direct, pluginDefault, 'get'),
			owner,
			schema,
			typeName,
		})
	}
	return surfaces
}
