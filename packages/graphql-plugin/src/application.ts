import {
	defineCapability,
	type ApplicationOperationTransport,
	type ApplicationCapabilityResource,
	type ApplicationSchemaMutationTransport,
	type CapabilityToken,
} from '@ultimabase/core'
import {
	GraphQLSchema,
	lexicographicSortSchema,
	printSchema,
	type ExecutionResult,
} from 'graphql'

import type { GraphqlConnectionRuntime } from './connection-runtime.js'
import type { GraphqlOperationExecution } from './operation-execution.js'
import type { graphqlProtocol } from './protocol.js'
import type { GraphqlSchemaMutationExecution } from './schema-mutation-execution.js'
import type { GraphqlExecuteOptions } from './networkless-execution.js'
import type { GraphqlNetworklessExecution } from './networkless-execution.js'

/** Exposes one application-local GraphQL schema without a network transport. */
export interface GraphqlApplication {
	/** The immutable executable schema compiled from this application's final Core graph. */
	readonly schema: GraphQLSchema
	/** Executes one bounded document with a real context from the same application. */
	execute(options: GraphqlExecuteOptions): Promise<ExecutionResult>
	/** Prints a deterministic SDL snapshot without executable resolver details. */
	printSchema(): string
}

interface GraphqlApplicationState {
	readonly connections: GraphqlConnectionRuntime
	readonly networkless: GraphqlNetworklessExecution
	readonly operations: GraphqlOperationExecution
	readonly schemaMutations: GraphqlSchemaMutationExecution
	readonly schema: GraphQLSchema
}

const graphqlApplicationStates = new WeakMap<object, GraphqlApplicationState>()

class GraphqlApplicationResource implements GraphqlApplication {
	constructor(
		schema: GraphQLSchema,
		connections: GraphqlConnectionRuntime,
		operations: GraphqlOperationExecution,
		schemaMutations: GraphqlSchemaMutationExecution,
		networkless: GraphqlNetworklessExecution,
	) {
		graphqlApplicationStates.set(this, {
			connections,
			networkless,
			operations,
			schemaMutations,
			schema,
		})
		Object.freeze(this)
	}

	get schema(): GraphQLSchema {
		const state = graphqlApplicationStates.get(this)
		if (state === undefined) {
			throw new TypeError('GraphQL application has been disposed')
		}
		return state.schema
	}

	execute(options: GraphqlExecuteOptions): Promise<ExecutionResult> {
		const state = graphqlApplicationStates.get(this)
		if (state === undefined) {
			return Promise.reject(
				new TypeError('GraphQL application has been disposed'),
			)
		}
		return state.networkless.execute(options)
	}

	printSchema(): string {
		return printSchema(lexicographicSortSchema(this.schema))
	}
}

const assertGraphqlApplication: (
	value: unknown,
) => asserts value is GraphqlApplication = (value) => {
	if (typeof value !== 'object' || value === null) {
		throw new TypeError('GraphQL application capability must be an object')
	}
	const schema: unknown = Reflect.get(value, 'schema')
	if (!(schema instanceof GraphQLSchema)) {
		throw new TypeError('GraphQL application capability schema is malformed')
	}
	if (
		typeof Reflect.get(value, 'execute') !== 'function' ||
		typeof Reflect.get(value, 'printSchema') !== 'function'
	) {
		throw new TypeError('GraphQL application capability executor is malformed')
	}
}

/** Carries one versioned GraphQL application to network adapters. */
export const graphqlApplicationCapability: CapabilityToken<
	GraphqlApplication,
	GraphqlApplication,
	'ultimabase.graphql.application',
	'1.0.0',
	'single',
	'application'
> = defineCapability<GraphqlApplication>()({
	capabilityId: 'ultimabase.graphql.application',
	version: '1.0.0',
	cardinality: 'single',
	lifetime: 'application',
	providerPrivilege: 'transport:expose',
	compose: ([application]) => {
		assertGraphqlApplication(application)
		return application
	},
})

/** @internal Binds schema lifetime to the owning application capability. */
export const createGraphqlApplicationResource = (
	schema: GraphQLSchema,
	connections: GraphqlConnectionRuntime,
	operations: GraphqlOperationExecution,
	schemaMutations: GraphqlSchemaMutationExecution,
	networkless: GraphqlNetworklessExecution,
): ApplicationCapabilityResource<GraphqlApplication> => {
	const value = new GraphqlApplicationResource(
		schema,
		connections,
		operations,
		schemaMutations,
		networkless,
	)
	return {
		value,
		dispose: (): void => {
			const state = graphqlApplicationStates.get(value)
			if (state !== undefined) {
				state.connections.dispose()
				state.operations.dispose()
				state.schemaMutations.dispose()
				// Removing the sole live state invalidates every facade and releases its graph.
				graphqlApplicationStates.delete(value)
			}
		},
	}
}

/** @internal Late-binds Core's exact operation facade after engine construction. */
export const bindGraphqlOperationTransport = (
	application: GraphqlApplication,
	transport: ApplicationOperationTransport,
): void => {
	const state = graphqlApplicationStates.get(application)
	if (state === undefined) {
		throw new TypeError('GraphQL application has been disposed')
	}
	state.operations.bind(transport)
}

/** @internal Late-binds Core's exact schema-mutation facade. */
export const bindGraphqlSchemaMutationTransport = (
	application: GraphqlApplication,
	transport: ApplicationSchemaMutationTransport<typeof graphqlProtocol>,
): void => {
	const state = graphqlApplicationStates.get(application)
	if (state === undefined) {
		throw new TypeError('GraphQL application has been disposed')
	}
	state.schemaMutations.bind(transport)
}

/** @internal Resolves the private cursor owner retained by a live capability. */
export const readGraphqlConnectionRuntime = (
	application: GraphqlApplication,
): GraphqlConnectionRuntime => {
	const state = graphqlApplicationStates.get(application)
	if (state === undefined) {
		throw new TypeError('GraphQL application has been disposed')
	}
	return state.connections
}
