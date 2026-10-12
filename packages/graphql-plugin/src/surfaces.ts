import type {
	CompiledSchemaRegistry,
	SchemaContributionOwner,
	SchemaDefinition,
} from '@ultimabase/core'

import {
	graphqlSourceDescription,
	type GraphqlNameRegistry,
} from './compile-context.js'
import { GraphqlSchemaCompilationError } from './errors.js'
import {
	isGraphqlMethodEnabled,
	readGraphqlSchemaRule,
	type GraphqlMethodName,
	type NormalizedGraphqlRule,
} from './rules.js'

/** The generated GraphQL surface of one schema and its enabled roots. */
export interface GraphqlSchemaSurface {
	readonly schema: SchemaDefinition
	readonly typeName: string
	readonly owner: SchemaContributionOwner
	readonly bulkCreate: boolean
	readonly bulkDelete: boolean
	readonly bulkUpdate: boolean
	readonly bulkUpsert: boolean
	readonly count: boolean
	readonly create: boolean
	readonly delete: boolean
	readonly exists: boolean
	readonly findMany: boolean
	readonly findOne: boolean
	readonly get: boolean
	readonly update: boolean
	readonly upsert: boolean
	/** Reports whether one plugin command is exposed on this schema. */
	readonly command: (name: string) => boolean
}

/** One generated root operation of a schema surface. */
export type GraphqlSurfaceOperation =
	| 'bulkCreate'
	| 'bulkDelete'
	| 'bulkUpdate'
	| 'bulkUpsert'
	| 'count'
	| 'create'
	| 'delete'
	| 'exists'
	| 'findMany'
	| 'findOne'
	| 'get'
	| 'update'
	| 'upsert'

/** The schema method behind each generated root operation (ADR-0325). */
export const graphqlOperationMethods: Readonly<
	Record<GraphqlSurfaceOperation, GraphqlMethodName>
> = {
	bulkCreate: 'createMany',
	bulkDelete: 'deleteMany',
	bulkUpdate: 'updateMany',
	bulkUpsert: 'upsertMany',
	count: 'count',
	create: 'createOne',
	delete: 'deleteOne',
	exists: 'exists',
	findMany: 'findMany',
	findOne: 'findOne',
	get: 'findOne',
	update: 'updateOne',
	upsert: 'upsertOne',
}

/** Resolves GraphQL identities and enabled roots from final provenance. */
export const collectGraphqlSchemaSurfaces = (
	schemas: CompiledSchemaRegistry,
	pluginDefault: NormalizedGraphqlRule | undefined,
	names: GraphqlNameRegistry,
): ReadonlyMap<SchemaDefinition, GraphqlSchemaSurface> => {
	const surfaces = new Map<SchemaDefinition, GraphqlSchemaSurface>()
	for (const schema of schemas.values()) {
		const owner = schema.definition.provenance.schema.owner
		const rule = readGraphqlSchemaRule(schema)
		if (owner.kind === 'plugin' && rule !== undefined) {
			throw new GraphqlSchemaCompilationError(
				'plugin-schema-option',
				`Plugin-owned schema ${schema.className} cannot declare the direct graphql option`,
				{ owner, path: schema.className },
			)
		}
		const typeName =
			typeof rule === 'object' && rule.typeName !== undefined
				? rule.typeName
				: schema.className
		names.claimType(typeName, graphqlSourceDescription(schema), owner)
		// Plugin-owned schemas are model types only: they never get generated roots.
		const application = owner.kind === 'application'
		const enabled = (key: string): boolean =>
			application && isGraphqlMethodEnabled(rule, pluginDefault, key)
		const operation = (name: GraphqlSurfaceOperation): boolean =>
			enabled(graphqlOperationMethods[name])
		surfaces.set(schema, {
			bulkCreate: operation('bulkCreate'),
			bulkDelete: operation('bulkDelete'),
			bulkUpdate: operation('bulkUpdate'),
			bulkUpsert: operation('bulkUpsert'),
			command: enabled,
			count: operation('count'),
			create: operation('create'),
			delete: operation('delete'),
			exists: operation('exists'),
			findMany: operation('findMany'),
			findOne: operation('findOne'),
			get: operation('get'),
			owner,
			schema,
			typeName,
			update: operation('update'),
			upsert: operation('upsert'),
		})
	}
	return surfaces
}
