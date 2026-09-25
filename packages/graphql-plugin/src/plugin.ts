import {
	applicationOperationTransportPlanningCapability,
	applicationRequestExecutionCapability,
	contributeApplication,
	contributeDeclarations,
	optionalCapability,
	plugin,
	provideCapability,
	requireCapability,
	type CapabilityRequirement,
	type CapabilityProviderContribution,
	type PluginInstance,
	type PluginOperationDefinition,
} from '@ultimabase/core'
import { definePluginOptionsParser } from '@ultimabase/plugin-kit'
import { immutableArray, isUnknownArray } from '@ultimabase/shared'
import { GraphQLSchema } from 'graphql'

import {
	createGraphqlApplicationResource,
	bindGraphqlOperationTransport,
	bindGraphqlSchemaMutationTransport,
	graphqlApplicationCapability,
	type GraphqlApplication,
} from './application.js'
import { compileGraphqlSchema } from './compiler.js'
import {
	defaultGraphqlExecutionLimits,
	normalizeGraphqlExecutionLimits,
	type GraphqlExecutionLimits,
} from './connection-limits.js'
import { GraphqlConnectionRuntime } from './connection-runtime.js'
import { GraphqlGeneratedExecution } from './generated-execution.js'
import { GraphqlOperationExecution } from './operation-execution.js'
import { GraphqlNetworklessExecution } from './networkless-execution.js'
import {
	graphqlSchemaOption,
	normalizeGraphqlSchemaOperations,
	normalizeGraphqlPluginOperations,
	type GraphqlSchemaOperations,
} from './options.js'
import { graphqlOperationProtocol, graphqlProtocol } from './protocol.js'
import { composeGraphqlSchemas } from './schema-composition.js'
import type { OwnedGraphqlSchema } from './schema-composition-types.js'
import { graphqlSchemaContributionsCapability } from './schema-contributions.js'
import { GraphqlSchemaMutationExecution } from './schema-mutation-execution.js'

/** Configures deterministic GraphQL v1 schema generation. */
export interface GraphqlPluginOptions {
	/** Accepts Core's inability to prove complete public policy coverage. */
	readonly acknowledgeUnverifiedProtection?: true
	/** Supplies sparse generated-operation defaults for application schemas. */
	readonly default?: boolean | GraphqlSchemaOperations
	/** Configures the forward Relay page window. */
	readonly limits?: GraphqlExecutionLimits
	/** Explicitly exposes exact application operations through owner bindings. */
	readonly operations?: readonly PluginOperationDefinition[]
	/** Adds completed application-owned schemas after the generated surface. */
	readonly schemas?: readonly GraphQLSchema[]
}

/** Exposes the application-local network-independent GraphQL schema. */
export type GraphqlPluginExports = GraphqlApplication

const parseGraphqlPluginOptions = definePluginOptionsParser({
	name: 'GraphQL plugin options',
	keys: [
		'acknowledgeUnverifiedProtection',
		'default',
		'limits',
		'operations',
		'schemas',
	] as const,
	normalize: ({
		acknowledgeUnverifiedProtection,
		default: defaultOperations,
		limits,
		operations,
		schemas,
	}) => {
		if (
			acknowledgeUnverifiedProtection !== undefined &&
			acknowledgeUnverifiedProtection !== true
		) {
			throw new TypeError(
				'GraphQL plugin acknowledgeUnverifiedProtection must be true when provided',
			)
		}
		return {
			acknowledgeUnverifiedProtection,
			defaultOperations:
				defaultOperations === undefined
					? undefined
					: normalizeGraphqlSchemaOperations(
							defaultOperations,
							'GraphQL plugin default',
						),
			limits:
				limits === undefined
					? defaultGraphqlExecutionLimits
					: normalizeGraphqlExecutionLimits(limits),
			operations: normalizeGraphqlPluginOperations(operations),
			schemas: normalizeCustomSchemas(schemas),
		}
	},
})

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

const requestExecutionRequirement: CapabilityRequirement<
	typeof applicationRequestExecutionCapability,
	false,
	'^1.0.0',
	'materialization'
> = requireCapability(applicationRequestExecutionCapability, '^1.0.0', {
	phase: 'materialization',
})
const operationPlanningRequirement: CapabilityRequirement<
	typeof applicationOperationTransportPlanningCapability,
	false,
	'^1.0.0',
	'materialization'
> = requireCapability(
	applicationOperationTransportPlanningCapability,
	'^1.0.0',
	{ phase: 'materialization' },
)
const graphqlApplicationRequirement: CapabilityRequirement<
	typeof graphqlApplicationCapability,
	false,
	'^1.0.0',
	'setup'
> = requireCapability(graphqlApplicationCapability, '^1.0.0', {
	phase: 'setup',
})
const optionalSchemaContributions: CapabilityRequirement<
	typeof graphqlSchemaContributionsCapability,
	true,
	'^1.0.0',
	'materialization'
> = optionalCapability(graphqlSchemaContributionsCapability, '^1.0.0')

const graphqlPluginPermissions = {
	'schema:declare': 'Declares the direct GraphQL schema exposure option.',
	'transport:expose':
		'Generates explicitly configured public GraphQL declarations.',
} as const

const pluginSchemaSources = (
	contributions: readonly CapabilityProviderContribution<
		typeof graphqlSchemaContributionsCapability
	>[],
): readonly OwnedGraphqlSchema[] =>
	immutableArray(
		contributions.flatMap((contribution) =>
			contribution.value.map((schema, index) => ({
				attribution: {
					kind: 'plugin' as const,
					owner: contribution.owner,
					pluginVersion: contribution.pluginVersion,
				},
				description: `plugin ${contribution.owner.pluginId}${contribution.owner.instanceId === undefined ? '' : `#${contribution.owner.instanceId}`} contribution ${contribution.contributionId}[${String(index)}]`,
				schema,
			})),
		),
	)

/** Names the sole GraphQL v1 owner for one application. */
export type GraphqlPlugin = PluginInstance<{
	readonly id: '@ultimabase/graphql-plugin'
	readonly exports: GraphqlPluginExports
	readonly version: '0.0.0'
	readonly core: '^0.0.0'
}>

/** Installs generated GraphQL schema execution without selecting an HTTP adapter. */
export const graphqlPlugin = (
	options: GraphqlPluginOptions = {},
): GraphqlPlugin => {
	const normalized = parseGraphqlPluginOptions(options)
	const applicationProvider = provideCapability(graphqlApplicationCapability, {
		contributionId: 'official-graphql-application',
		create: ({ callbacks, capabilities: reader, owner, schemas }) => {
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
				const schema = composeGraphqlSchemas({
					callbacks,
					schemas: [
						{
							attribution: {
								kind: 'generated',
								owner,
								pluginVersion: '0.0.0',
							},
							description: 'generated GraphQL schema',
							schema: generated,
						},
						...normalized.schemas.map((custom, index) => ({
							attribution: { kind: 'application' as const },
							description: `application schema[${String(index)}]`,
							schema: custom,
						})),
						...pluginSchemaSources(
							reader.contributions(optionalSchemaContributions),
						),
					],
				})
				const networkless = new GraphqlNetworklessExecution({
					callbacks,
					executor: reader.get(requestExecutionRequirement),
					limits: normalized.limits,
					owner,
					schema,
				})
				return createGraphqlApplicationResource(
					schema,
					connections,
					operations,
					schemaMutations,
					networkless,
				)
			} catch (error: unknown) {
				connections.dispose()
				operations.dispose()
				schemaMutations.dispose()
				throw error
			}
		},
	})
	const declarations = contributeDeclarations({
		schema: ({ schemas }) => {
			schemas.defineOptions({
				contributionId: 'official-graphql-schema-option',
				schema: { graphql: graphqlSchemaOption },
			})
			return undefined
		},
	})
	const application = contributeApplication(({ capabilities: reader }) => {
		const exports = reader.get(graphqlApplicationRequirement)
		return {
			exports,
			startTransports: () => {
				if (normalized.operations.length > 0) {
					bindGraphqlOperationTransport(
						exports,
						reader.get(requestExecutionRequirement).exposeOperations({
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
					reader.get(requestExecutionRequirement).exposeSchemaMutations({
						// Generated roots are part of the one public GraphQL report below.
						acknowledgeUnverifiedProtection: true,
						transport: graphqlProtocol,
					}),
				)
				reader
					.get(requestExecutionRequirement)
					.reportPublicTransportProtection({
						...(normalized.acknowledgeUnverifiedProtection === true
							? { acknowledgeUnverifiedProtection: true as const }
							: {}),
						transport: graphqlProtocol,
					})
			},
		}
	})
	const instance = plugin({
		id: '@ultimabase/graphql-plugin',
		version: '0.0.0',
		core: '^0.0.0',
		permissions: graphqlPluginPermissions,
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
	return instance
}
