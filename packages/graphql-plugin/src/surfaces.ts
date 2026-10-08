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
	readGraphqlSchemaExposure,
	type GraphqlBulkOperations,
	type GraphqlSchemaExposureOption,
	type GraphqlSchemaOperations,
} from './options.js'

type GeneratedOperation = Exclude<
	keyof GraphqlSchemaOperations,
	'bulk' | 'mutations'
>
type BulkOperation = keyof GraphqlBulkOperations
type OperationSelection = boolean | GraphqlSchemaOperations | undefined

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
	readonly schemaMutations: boolean
	readonly update: boolean
	readonly upsert: boolean
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

// A boolean selects every operation; an object answers only what it declares.
const resolveSelection = (
	direct: GraphqlSchemaExposureOption | undefined,
	pluginDefault: OperationSelection,
	read: (operations: GraphqlSchemaOperations) => boolean | undefined,
	fallback: boolean,
): boolean => {
	const pick = (value: OperationSelection): boolean | undefined =>
		typeof value === 'boolean' || value === undefined ? value : read(value)
	return (
		pick(typeof direct === 'boolean' ? direct : direct?.operations) ??
		pick(pluginDefault) ??
		fallback
	)
}

/** Resolves one operation through schema, plugin, then built-in defaults. */
export const resolveGraphqlSchemaOperation = (
	direct: GraphqlSchemaExposureOption | undefined,
	pluginDefault: OperationSelection,
	operation: GeneratedOperation,
): boolean =>
	resolveSelection(
		direct,
		pluginDefault,
		(operations) => operations[operation],
		builtInOperationDefaults[operation],
	)

/** Resolves one bulk operation through schema, plugin, then disabled default. */
export const resolveGraphqlBulkOperation = (
	direct: GraphqlSchemaExposureOption | undefined,
	pluginDefault: OperationSelection,
	operation: BulkOperation,
): boolean =>
	resolveSelection(
		direct,
		pluginDefault,
		({ bulk }) => (typeof bulk === 'boolean' ? bulk : bulk?.[operation]),
		false,
	)

/** Resolves whether one application schema exposes its bound schema mutations. */
export const resolveGraphqlSchemaMutations = (
	direct: GraphqlSchemaExposureOption | undefined,
	pluginDefault: OperationSelection,
): boolean =>
	resolveSelection(direct, pluginDefault, ({ mutations }) => mutations, true)

/** Resolves GraphQL identities and public get roots from final provenance. */
export const collectGraphqlSchemaSurfaces = (
	schemas: CompiledSchemaRegistry,
	pluginDefault: OperationSelection,
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
		names.claimType(typeName, graphqlSourceDescription(schema), owner)
		// Plugin-owned schemas are model types only: they never get generated roots.
		const application = owner.kind === 'application'
		const operation = (name: GeneratedOperation): boolean =>
			application && resolveGraphqlSchemaOperation(direct, pluginDefault, name)
		const bulk = (name: BulkOperation): boolean =>
			application && resolveGraphqlBulkOperation(direct, pluginDefault, name)
		surfaces.set(schema, {
			bulkCreate: bulk('create'),
			bulkDelete: bulk('delete'),
			bulkUpdate: bulk('update'),
			bulkUpsert: bulk('upsert'),
			count: operation('count'),
			create: operation('create'),
			delete: operation('delete'),
			exists: operation('exists'),
			findMany: operation('findMany'),
			findOne: operation('findOne'),
			get: operation('get'),
			owner,
			schema,
			schemaMutations:
				application && resolveGraphqlSchemaMutations(direct, pluginDefault),
			typeName,
			update: operation('update'),
			upsert: operation('upsert'),
		})
	}
	return surfaces
}
