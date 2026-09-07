import {
	applicationOperationTransportPlanningCapability,
	applicationRequestExecutionCapability,
	provideCapability,
	requireCapability,
	type CapabilityProviderDeclaration,
	type CapabilityRequirement,
	type PluginOperationDefinition,
} from '@ultimabase/core'
import {
	definePluginModule,
	definePluginOptionsParser,
	type PluginModule,
	type PluginModuleInstance,
} from '@ultimabase/plugin-kit'

import {
	createGraphqlApplicationResource,
	bindGraphqlOperationTransport,
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
import {
	graphqlSchemaOption,
	normalizeGraphqlSchemaOperations,
	normalizeGraphqlPluginOperations,
	type GraphqlSchemaOperations,
} from './options.js'
import { graphqlOperationProtocol, graphqlProtocol } from './protocol.js'

const graphqlPluginModule: PluginModule<
	'@ultimabase/graphql-plugin',
	'0.0.0',
	'^0.0.0'
> = definePluginModule({
	core: '^0.0.0',
	pluginId: '@ultimabase/graphql-plugin',
	version: '0.0.0',
})

/** Configures deterministic GraphQL v1 schema generation. */
export interface GraphqlPluginOptions {
	/** Accepts Core's inability to prove complete public policy coverage. */
	readonly acknowledgeUnverifiedProtection?: true
	/** Supplies sparse generated-operation defaults for application schemas. */
	readonly default?: boolean | GraphqlSchemaOperations
	/** Configures the forward Relay page window. */
	readonly limits?: GraphqlExecutionLimits
	/** Explicitly exposes exact application operations through owner bindings. */
	readonly operations?: readonly PluginOperationDefinition<
		string,
		string,
		'application'
	>[]
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
	] as const,
	normalize: ({
		acknowledgeUnverifiedProtection,
		default: defaultOperations,
		limits,
		operations,
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
		}
	},
})

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

const graphqlPluginPrivileges = [
	{
		name: 'schema:declare',
		reason: 'Declares the direct GraphQL schema exposure option.',
	},
	{
		name: 'transport:expose',
		reason: 'Generates explicitly configured public GraphQL declarations.',
	},
] as const

type GraphqlPluginCapabilities = Readonly<{
	readonly provides: readonly [
		CapabilityProviderDeclaration<typeof graphqlApplicationCapability>,
	]
	readonly requires: readonly [
		CapabilityRequirement<
			typeof applicationRequestExecutionCapability,
			false,
			'^1.0.0',
			'materialization'
		>,
		typeof operationPlanningRequirement,
		typeof graphqlApplicationRequirement,
	]
}>

type GraphqlPluginDefinition = Readonly<{
	readonly capabilities: GraphqlPluginCapabilities
	readonly declare: () => undefined
	readonly privileges: typeof graphqlPluginPrivileges
	readonly setup: () => GraphqlPluginExports
}>

/** Names the sole GraphQL v1 owner for one application. */
export type GraphqlPlugin = PluginModuleInstance<
	typeof graphqlPluginModule,
	GraphqlPluginDefinition
>

/** Installs generated GraphQL schema execution without selecting an HTTP adapter. */
export const graphqlPlugin = (
	options: GraphqlPluginOptions = {},
): GraphqlPlugin => {
	const normalized = parseGraphqlPluginOptions(options)
	const applicationProvider = provideCapability(graphqlApplicationCapability, {
		contributionId: 'official-graphql-application',
		create: ({ callbacks, capabilities: reader, owner, schemas }) => {
			const connections = new GraphqlConnectionRuntime(normalized.limits)
			const operationPlan = reader.get(operationPlanningRequirement).plan({
				operations: normalized.operations,
				transport: graphqlOperationProtocol,
			})
			const operations = new GraphqlOperationExecution(operationPlan)
			try {
				const execution = new GraphqlGeneratedExecution({
					callbacks,
					connections,
					executor: reader.get(requestExecutionRequirement),
					operations,
					owner,
				})
				return createGraphqlApplicationResource(
					compileGraphqlSchema({
						connectionLimits: normalized.limits,
						...(normalized.defaultOperations === undefined
							? {}
							: { defaultOperations: normalized.defaultOperations }),
						execution,
						operationPlan,
						schemas,
					}),
					connections,
					operations,
				)
			} catch (error: unknown) {
				connections.dispose()
				operations.dispose()
				throw error
			}
		},
	})
	const capabilities: GraphqlPluginCapabilities = {
		provides: [applicationProvider],
		requires: [
			requestExecutionRequirement,
			operationPlanningRequirement,
			graphqlApplicationRequirement,
		],
	}

	return graphqlPluginModule.plugin({
		capabilities,
		privileges: graphqlPluginPrivileges,
		declare: ({ schemas }) => {
			schemas.defineOptions({
				contributionId: 'official-graphql-schema-option',
				schema: { graphql: graphqlSchemaOption },
			})
		},
		setup: ({ capabilities: reader }) =>
			reader.get(graphqlApplicationRequirement),
		hooks: {
			startTransports: ({ capabilities: reader, pluginExports }) => {
				if (normalized.operations.length > 0) {
					bindGraphqlOperationTransport(
						pluginExports,
						reader.get(requestExecutionRequirement).exposeOperations({
							// The GraphQL surface reports once below; this private bridge is not
							// a second independently reachable public transport.
							acknowledgeUnverifiedProtection: true,
							operations: normalized.operations,
							transport: graphqlOperationProtocol,
						}),
					)
				}
				reader
					.get(requestExecutionRequirement)
					.reportPublicTransportProtection({
						...(normalized.acknowledgeUnverifiedProtection === true
							? { acknowledgeUnverifiedProtection: true as const }
							: {}),
						transport: graphqlProtocol,
					})
			},
		},
	})
}
