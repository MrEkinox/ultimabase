import {
	applicationRequestExecutionCapability,
	provideCapability,
	requireCapability,
	type CapabilityProviderDeclaration,
	type CapabilityRequirement,
} from '@ultimabase/core'
import {
	definePluginModule,
	definePluginOptionsParser,
	type PluginModule,
	type PluginModuleInstance,
} from '@ultimabase/plugin-kit'

import {
	createGraphqlApplicationResource,
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
import {
	graphqlSchemaOption,
	normalizeGraphqlSchemaOperations,
	type GraphqlSchemaOperations,
} from './options.js'
import { graphqlProtocol } from './protocol.js'

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
}

/** Exposes the application-local network-independent GraphQL schema. */
export type GraphqlPluginExports = GraphqlApplication

const parseGraphqlPluginOptions = definePluginOptionsParser({
	name: 'GraphQL plugin options',
	keys: ['acknowledgeUnverifiedProtection', 'default', 'limits'] as const,
	normalize: ({
		acknowledgeUnverifiedProtection,
		default: defaultOperations,
		limits,
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
			try {
				const execution = new GraphqlGeneratedExecution({
					callbacks,
					connections,
					executor: reader.get(requestExecutionRequirement),
					owner,
				})
				return createGraphqlApplicationResource(
					compileGraphqlSchema({
						connectionLimits: normalized.limits,
						...(normalized.defaultOperations === undefined
							? {}
							: { defaultOperations: normalized.defaultOperations }),
						execution,
						schemas,
					}),
					connections,
				)
			} catch (error: unknown) {
				connections.dispose()
				throw error
			}
		},
	})
	const capabilities: GraphqlPluginCapabilities = {
		provides: [applicationProvider],
		requires: [requestExecutionRequirement, graphqlApplicationRequirement],
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
			startTransports: ({ capabilities: reader }) => {
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
