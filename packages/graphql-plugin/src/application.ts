import {
	defineCapability,
	type ApplicationOperationTransport,
	type ApplicationCapabilityResource,
	type CapabilityToken,
} from '@ultimabase/core'
import { GraphQLSchema } from 'graphql'

import type { GraphqlConnectionRuntime } from './connection-runtime.js'
import type { GraphqlOperationExecution } from './operation-execution.js'

/** Exposes one application-local GraphQL schema without a network transport. */
export interface GraphqlApplication {
	/** The immutable executable schema compiled from this application's final Core graph. */
	readonly schema: GraphQLSchema
}

interface GraphqlApplicationState {
	connections: GraphqlConnectionRuntime | undefined
	disposed: boolean
	operations: GraphqlOperationExecution | undefined
	schema: GraphQLSchema | undefined
}

const graphqlApplicationStates = new WeakMap<object, GraphqlApplicationState>()

class GraphqlApplicationResource implements GraphqlApplication {
	constructor(
		schema: GraphQLSchema,
		connections: GraphqlConnectionRuntime,
		operations: GraphqlOperationExecution,
	) {
		graphqlApplicationStates.set(this, {
			connections,
			disposed: false,
			operations,
			schema,
		})
		Object.freeze(this)
	}

	get schema(): GraphQLSchema {
		const state = graphqlApplicationStates.get(this)
		if (state === undefined || state.disposed || state.schema === undefined) {
			throw new TypeError('GraphQL application has been disposed')
		}
		return state.schema
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
): ApplicationCapabilityResource<GraphqlApplication> => {
	const value = new GraphqlApplicationResource(schema, connections, operations)
	return {
		value,
		dispose: (): void => {
			const state = graphqlApplicationStates.get(value)
			if (state !== undefined) {
				state.connections?.dispose()
				state.operations?.dispose()
				state.connections = undefined
				state.operations = undefined
				state.disposed = true
				state.schema = undefined
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
	if (state?.disposed !== false || state.operations === undefined) {
		throw new TypeError('GraphQL application has been disposed')
	}
	state.operations.bind(transport)
}

/** @internal Resolves the private cursor owner retained by a live capability. */
export const readGraphqlConnectionRuntime = (
	application: GraphqlApplication,
): GraphqlConnectionRuntime => {
	const state = graphqlApplicationStates.get(application)
	if (state?.disposed !== false || state.connections === undefined) {
		throw new TypeError('GraphQL application has been disposed')
	}
	return state.connections
}
