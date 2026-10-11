import {
	applicationOperationTransportPlanningCapability,
	applicationRequestExecutionCapability,
} from '@ultimabase/core'
import {
	contributeApplication,
	contributeDeclarations,
	optionalCapability,
	plugin,
	provideCapability,
	requireCapability,
	type PluginDeclarationContribution,
	type PluginInstance,
	type PluginOperationDefinition,
	type PluginSchemaOptionSource,
} from '@ultimabase/core/plugin'
import { definePluginOptionsParser } from '@ultimabase/plugin-kit'
import { immutableArray, isUnknownArray } from '@ultimabase/shared'
import { GraphQLSchema } from 'graphql'

import {
	bindGraphqlOperationTransport,
	bindGraphqlSchemaMutationTransport,
	createGraphqlApplicationResource,
	graphqlApplicationCapability,
	type GraphqlApplication,
} from './application.js'
import { compileGraphqlSchema } from './compiler.js'
import {
	defaultGraphqlExecutionLimits,
	normalizeGraphqlExecutionLimits,
	type GraphqlExecutionLimits,
	type GraphqlPaginationOptions,
} from './connection-limits.js'
import { GraphqlConnectionRuntime } from './connection-runtime.js'
import { GraphqlGeneratedExecution } from './generated-execution.js'
import { GraphqlNetworklessExecution } from './networkless-execution.js'
import { GraphqlOperationExecution } from './operation-execution.js'
import {
	graphqlSchemaOption,
	normalizeGraphqlPluginOperations,
	normalizeGraphqlSchemaOperations,
	type GraphqlSchemaOperations,
} from './options.js'
import { graphqlOperationProtocol, graphqlProtocol } from './protocol.js'
import { composeGraphqlSchemas } from './schema-composition.js'
import { graphqlSchemaContributionsCapability } from './schema-contributions.js'
import { GraphqlSchemaMutationExecution } from './schema-mutation-execution.js'

/** Configures deterministic GraphQL v1 schema generation. */
export interface GraphqlPluginOptions {
	/** Accepts Core's inability to prove complete public policy coverage. */
	readonly acknowledgeUnverifiedProtection?: true
	/** Supplies sparse generated-operation defaults for application schemas. */
	readonly default?: boolean | GraphqlSchemaOperations
	/** Bounds document size, depth, aliases, root fields and variables. */
	readonly limits?: GraphqlExecutionLimits
	/** Explicitly exposes exact application operations through owner bindings. */
	readonly operations?: readonly PluginOperationDefinition[]
	/**
	 * Default and largest Relay `first`, as REST `take` (ADR-0309).
	 *
	 * @default { defaultTake: 100, maxTake: 1000 }
	 * @example `graphqlPlugin({ pagination: { defaultTake: 20, maxTake: 200 } })`
	 */
	readonly pagination?: GraphqlPaginationOptions
	/** Adds completed application-owned schemas after the generated surface. */
	readonly schemas?: readonly GraphQLSchema[]
}

/** Exposes the application-local network-independent GraphQL schema. */
export type GraphqlPluginExports = GraphqlApplication

const normalizeCustomSchemas = (value: unknown): readonly GraphQLSchema[] => {
	if (value === undefined) return immutableArray([])
	if (!isUnknownArray(value)) {
		throw new TypeError('GraphQL plugin schemas must be an array')
	}
	const schemas: GraphQLSchema[] = []
	for (const [index, schema] of value.entries()) {
		if (!(schema instanceof GraphQLSchema)) {
			throw new TypeError(
				`GraphQL plugin schemas[${String(index)}] must be a completed GraphQLSchema`,
			)
		}
		schemas.push(schema)
	}
	return immutableArray(schemas)
}

const parseGraphqlPluginOptions = definePluginOptionsParser({
	name: 'GraphQL plugin options',
	keys: [
		'acknowledgeUnverifiedProtection',
		'default',
		'limits',
		'operations',
		'pagination',
		'schemas',
	] as const,
	normalize: (options) => {
		const acknowledged = options.acknowledgeUnverifiedProtection
		if (acknowledged !== undefined && acknowledged !== true) {
			throw new TypeError(
				'GraphQL plugin acknowledgeUnverifiedProtection must be true when provided',
			)
		}
		return {
			acknowledgeUnverifiedProtection: acknowledged,
			defaultOperations:
				options.default === undefined
					? undefined
					: normalizeGraphqlSchemaOperations(
							options.default,
							'GraphQL plugin default',
						),
			limits:
				options.limits === undefined && options.pagination === undefined
					? defaultGraphqlExecutionLimits
					: normalizeGraphqlExecutionLimits(options.limits, options.pagination),
			operations: normalizeGraphqlPluginOperations(options.operations),
			schemas: normalizeCustomSchemas(options.schemas),
		}
	},
})

const requestExecutionRequirement = requireCapability(
	applicationRequestExecutionCapability,
	'^1.0.0',
	{ phase: 'materialization' },
)
const operationPlanningRequirement = requireCapability(
	applicationOperationTransportPlanningCapability,
	'^1.0.0',
	{ phase: 'materialization' },
)
const graphqlApplicationRequirement = requireCapability(
	graphqlApplicationCapability,
	'^1.0.0',
	{ phase: 'setup' },
)
const optionalSchemaContributions = optionalCapability(
	graphqlSchemaContributionsCapability,
	'^1.0.0',
)

// The configured factory derives the option from this same authorized declaration.
type GraphqlOptionSource = PluginSchemaOptionSource<{
	readonly contributionId: 'official-graphql-schema-option'
	readonly schema: Readonly<{ graphql: typeof graphqlSchemaOption }>
}>

/** Names the sole GraphQL v1 owner for one application. */
export type GraphqlPlugin = PluginInstance<{
	readonly id: '@ultimabase/graphql-plugin'
	readonly exports: GraphqlPluginExports
	readonly version: '0.0.0'
	readonly core: '^0.0.0'
	readonly source: GraphqlOptionSource
}>

/** Installs generated GraphQL schema execution without selecting an HTTP adapter. */
export const graphqlPlugin = (
	options: GraphqlPluginOptions = {},
): GraphqlPlugin => {
	const normalized = parseGraphqlPluginOptions(options)
	const applicationProvider = provideCapability(graphqlApplicationCapability, {
		contributionId: 'official-graphql-application',
		create: ({ callbacks, capabilities: reader, logger, owner, schemas }) => {
			const connections = new GraphqlConnectionRuntime(normalized.limits)
			const planner = reader.get(operationPlanningRequirement)
			const operationPlan = planner.plan({
				operations: normalized.operations,
				transport: graphqlOperationProtocol,
			})
			const operations = new GraphqlOperationExecution(operationPlan)
			const schemaMutationPlan = planner.planSchemaMutations({
				transport: graphqlProtocol,
			})
			const schemaMutations = new GraphqlSchemaMutationExecution(
				schemaMutationPlan,
			)
			try {
				const execution = new GraphqlGeneratedExecution({
					callbacks,
					connections,
					executor: reader.get(requestExecutionRequirement),
					logger,
					operations,
					owner,
					schemaMutations,
				})
				const generated = compileGraphqlSchema({
					connectionLimits: normalized.limits,
					...(normalized.defaultOperations === undefined
						? {}
						: { defaultOperations: normalized.defaultOperations }),
					execution,
					operationPlan,
					schemaMutationPlan,
					schemaMutations,
					schemas,
				})
				// Generated roots first, then application schemas, then plugin contributions.
				const schema = composeGraphqlSchemas({
					callbacks,
					logger,
					schemas: [
						{
							attribution: { kind: 'generated', owner, pluginVersion: '0.0.0' },
							description: 'generated GraphQL schema',
							schema: generated,
						},
						...normalized.schemas.map((custom, index) => ({
							attribution: { kind: 'application' as const },
							description: `application schema[${String(index)}]`,
							schema: custom,
						})),
						...reader
							.contributions(optionalSchemaContributions)
							.flatMap((contribution) =>
								contribution.value.map((custom, index) => ({
									attribution: {
										kind: 'plugin' as const,
										owner: contribution.owner,
										pluginVersion: contribution.pluginVersion,
									},
									description: `plugin ${contribution.owner.pluginId}${contribution.owner.instanceId === undefined ? '' : `#${contribution.owner.instanceId}`} contribution ${contribution.contributionId}[${String(index)}]`,
									schema: custom,
								})),
							),
					],
				})
				const networkless = new GraphqlNetworklessExecution({
					callbacks,
					executor: reader.get(requestExecutionRequirement),
					limits: normalized.limits,
					logger,
					owner,
					schema,
				})
				return createGraphqlApplicationResource({
					connections,
					networkless,
					operations,
					schema,
					schemaMutations,
				})
			} catch (error: unknown) {
				connections.dispose()
				operations.dispose()
				schemaMutations.dispose()
				throw error
			}
		},
	})
	const declarations: PluginDeclarationContribution<
		readonly [],
		GraphqlOptionSource
	> = contributeDeclarations({
		schema: ({ schemas }) =>
			schemas.defineOptions({
				contributionId: 'official-graphql-schema-option',
				schema: { graphql: graphqlSchemaOption },
			}),
	})
	const application = contributeApplication(({ capabilities: reader }) => {
		const exports = reader.get(graphqlApplicationRequirement)
		return {
			exports,
			startTransports: () => {
				const executor = reader.get(requestExecutionRequirement)
				if (normalized.operations.length > 0) {
					bindGraphqlOperationTransport(
						exports,
						executor.exposeOperations({
							// The GraphQL surface reports once below; this private bridge is not
							// a second independently reachable public transport.
							acknowledgeUnverifiedProtection: true,
							operations: normalized.operations,
							transport: graphqlOperationProtocol,
						}),
					)
				}
				bindGraphqlSchemaMutationTransport(
					exports,
					executor.exposeSchemaMutations({
						// Generated roots are part of the one public GraphQL report below.
						acknowledgeUnverifiedProtection: true,
						transport: graphqlProtocol,
					}),
				)
				executor.reportPublicTransportProtection({
					...(normalized.acknowledgeUnverifiedProtection === true
						? { acknowledgeUnverifiedProtection: true as const }
						: {}),
					transport: graphqlProtocol,
				})
			},
		}
	})
	return plugin({
		id: '@ultimabase/graphql-plugin',
		version: '0.0.0',
		core: '^0.0.0',
		contributions: [
			optionalSchemaContributions,
			applicationProvider,
			requestExecutionRequirement,
			operationPlanningRequirement,
			graphqlApplicationRequirement,
			declarations,
			application,
		],
	})
}
