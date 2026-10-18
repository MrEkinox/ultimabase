import type {
	ApplicationExposurePlan,
	CompiledSchemaRegistry,
	ExposedSchemaMethod,
	SchemaContributionOwner,
	SchemaDefinition,
} from '@ultimabase/core'

import {
	graphqlSourceDescription,
	type GraphqlNameRegistry,
} from './compile-context.js'
import { GraphqlSchemaCompilationError } from './errors.js'
import { readGraphqlTypeName, type GraphqlMethodName } from './rules.js'

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
	/** The methods and plugin commands Core's plan serves, by method name. */
	readonly methods: ReadonlyMap<string, ExposedSchemaMethod>
	/**
	 * Whether a generated root or a plugin command of this schema is exposed.
	 * A schema without one contributes types only where an exposed type
	 * reaches it (ADR-0333).
	 */
	readonly exposed: boolean
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

/**
 * Refuses a `graphql` rule on a plugin-owned schema before Core plans the
 * exposure, so the message keeps GraphQL's compilation error (ADR-0333).
 */
export const assertNoPluginOwnedGraphqlRule = (
	schemas: CompiledSchemaRegistry,
): void => {
	for (const schema of schemas.values()) {
		const { owner } = schema.definition.provenance.schema
		if (
			owner.kind === 'plugin' &&
			Object.hasOwn(schema.definition, 'graphql')
		) {
			throw new GraphqlSchemaCompilationError(
				'plugin-schema-option',
				`Plugin-owned schema ${schema.className} cannot declare the direct graphql option`,
				{ owner, path: schema.className },
			)
		}
	}
}

/**
 * Lays out the GraphQL identity and roots of every schema from Core's
 * exposure plan (ADR-0347): GraphQL decides names, never exposure.
 */
export const collectGraphqlSchemaSurfaces = (
	schemas: CompiledSchemaRegistry,
	plan: ApplicationExposurePlan,
	names: GraphqlNameRegistry,
): ReadonlyMap<SchemaDefinition, GraphqlSchemaSurface> => {
	const served = new Map(
		plan.schemas.map(({ className, methods }) => [
			className,
			new Map(methods.map((method) => [method.entry.method, method])),
		]),
	)
	const surfaces = new Map<SchemaDefinition, GraphqlSchemaSurface>()
	for (const schema of schemas.values()) {
		const owner = schema.definition.provenance.schema.owner
		const typeName = readGraphqlTypeName(schema)
		names.claimType(typeName, graphqlSourceDescription(schema), owner)
		// Plugin-owned schemas are never in the plan: their types appear only
		// where an exposed type or a public operation reaches them (ADR-0333).
		const methods: ReadonlyMap<string, ExposedSchemaMethod> =
			served.get(schema.className) ?? new Map()
		const operation = (name: GraphqlSurfaceOperation): boolean =>
			methods.has(graphqlOperationMethods[name])
		surfaces.set(schema, {
			bulkCreate: operation('bulkCreate'),
			bulkDelete: operation('bulkDelete'),
			bulkUpdate: operation('bulkUpdate'),
			bulkUpsert: operation('bulkUpsert'),
			count: operation('count'),
			create: operation('create'),
			delete: operation('delete'),
			exists: operation('exists'),
			exposed: methods.size > 0,
			findMany: operation('findMany'),
			findOne: operation('findOne'),
			get: operation('get'),
			methods,
			owner,
			schema,
			typeName,
			update: operation('update'),
			upsert: operation('upsert'),
		})
	}
	return surfaces
}
