import {
	readSchemaCommandClosure,
	type CompiledSchemaRegistry,
	type SchemaContributionOwner,
	type SchemaDefinition,
} from '@ultimabase/core'
import { formatPluginIdentity } from '@ultimabase/core/plugin'

import {
	graphqlSourceDescription,
	type GraphqlNameRegistry,
} from './compile-context.js'
import { GraphqlSchemaCompilationError } from './errors.js'
import {
	graphqlMethodNames,
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
 * Names where an explicit `true` for one method comes from: the schema rule's
 * own key, else the plugin default's when the schema rule leaves the key
 * open. A `true` rule or default enables everything without naming it.
 */
const explicitSetting = (
	schema: NormalizedGraphqlRule | undefined,
	defaults: NormalizedGraphqlRule | undefined,
	key: string,
): 'default' | 'schema' | undefined => {
	if (typeof schema === 'object' && Object.hasOwn(schema.methods, key)) {
		return schema.methods[key] === true ? 'schema' : undefined
	}
	if (typeof schema === 'boolean') return undefined
	return typeof defaults === 'object' && defaults.methods[key] === true
		? 'default'
		: undefined
}

/**
 * Refuses an explicit setting that would publish a method a plugin closed on
 * the schema (ADR-0341); the defaults and `true` forms leave it unpublished.
 */
const assertClosedMethodsUnrequested = (
	schema: SchemaDefinition,
	rule: NormalizedGraphqlRule | undefined,
	defaults: NormalizedGraphqlRule | undefined,
): void => {
	for (const method of graphqlMethodNames) {
		const closure = readSchemaCommandClosure(schema, method)
		if (closure === undefined) continue
		const source = explicitSetting(rule, defaults, method)
		if (source === undefined) continue
		const { className } = schema
		throw new TypeError(
			`${className}.${method} is closed by plugin "${formatPluginIdentity(closure.owner)}": ${closure.reason} ${
				source === 'schema'
					? `Remove ${method} from .with({ graphql }) of ${className}.`
					: `Remove ${method} from graphqlPlugin({ default }), or set it to false in .with({ graphql }) of ${className}.`
			}`,
		)
	}
}

/**
 * Resolves GraphQL identities and enabled roots from final provenance.
 * `commands` lists, per schema class name, the request commands GraphQL
 * may expose.
 */
export const collectGraphqlSchemaSurfaces = (
	schemas: CompiledSchemaRegistry,
	pluginDefault: NormalizedGraphqlRule | undefined,
	names: GraphqlNameRegistry,
	commands: ReadonlyMap<string, readonly string[]>,
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
		// Plugin-owned schemas never get generated roots: their types appear only
		// where an exposed type or a public operation reaches them (ADR-0333).
		const application = owner.kind === 'application'
		if (application) {
			assertClosedMethodsUnrequested(schema, rule, pluginDefault)
		}
		// A command a plugin closed has no root, whatever the rules (ADR-0341).
		const enabled = (key: string): boolean =>
			application &&
			isGraphqlMethodEnabled(rule, pluginDefault, key) &&
			readSchemaCommandClosure(schema, key) === undefined
		const operation = (name: GraphqlSurfaceOperation): boolean =>
			enabled(graphqlOperationMethods[name])
		const exposed =
			Object.values(graphqlOperationMethods).some(enabled) ||
			(commands.get(schema.className) ?? []).some(enabled)
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
			exposed,
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
