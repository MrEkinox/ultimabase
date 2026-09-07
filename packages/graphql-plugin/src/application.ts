import {
	defineCapability,
	type ApplicationCapabilityResource,
	type CapabilityToken,
} from '@ultimabase/core'
import { GraphQLSchema } from 'graphql'

/** Exposes one application-local GraphQL schema without a network transport. */
export interface GraphqlApplication {
	/** The immutable schema compiled from this application's final Core graph. */
	readonly schema: GraphQLSchema
}

interface GraphqlApplicationState {
	disposed: boolean
	schema: GraphQLSchema | undefined
}

const graphqlApplicationStates = new WeakMap<object, GraphqlApplicationState>()

class GraphqlApplicationResource implements GraphqlApplication {
	constructor(schema: GraphQLSchema) {
		graphqlApplicationStates.set(this, { disposed: false, schema })
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
): ApplicationCapabilityResource<GraphqlApplication> => {
	const value = new GraphqlApplicationResource(schema)
	return {
		value,
		dispose: (): void => {
			const state = graphqlApplicationStates.get(value)
			if (state !== undefined) {
				state.disposed = true
				state.schema = undefined
			}
		},
	}
}
