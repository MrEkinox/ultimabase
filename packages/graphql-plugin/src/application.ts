import type {
	ApplicationOperationTransport,
	ApplicationSchemaMutationTransport,
} from '@ultimabase/core'
import {
	defineCapability,
	type ApplicationCapabilityResource,
	type CapabilityToken,
} from '@ultimabase/core/plugin'
import {
	GraphQLSchema,
	lexicographicSortSchema,
	printSchema,
	type ExecutionResult,
	type ValidationRule,
} from 'graphql'

import type { GraphqlConnectionRuntime } from './connection-runtime.js'
import type { GraphqlWriteRoot } from './exposure.js'
import type { GraphqlOperationExecution } from './operation-execution.js'
import type { graphqlProtocol } from './protocol.js'
import type { GraphqlSchemaMutationExecution } from './schema-mutation-execution.js'
import type {
	GraphqlExecuteOptions,
	GraphqlNetworklessExecution,
} from './networkless-execution.js'

/** Exposes one application-local GraphQL schema without a network transport. */
export interface GraphqlApplication {
	/** The immutable executable schema compiled from this application's final Core graph. */
	readonly schema: GraphQLSchema
	/** Executes one bounded document with a real context from the same application. */
	execute(options: GraphqlExecuteOptions): Promise<ExecutionResult>
	/** Prints a deterministic SDL snapshot without executable resolver details. */
	printSchema(): string
	/**
	 * GraphQL's specified validation rules, where an unknown field that a
	 * disabled feature would add names how to enable it outside production
	 * (ADR-0325, ADR-0333); network adapters validate documents with them.
	 */
	readonly validationRules: readonly ValidationRule[]
}

/** @internal What startup checks read from the compiled schema. */
export interface GraphqlApplicationFacts {
	/** Whether any schema root or operation is exposed besides `health`. */
	readonly exposed: boolean
	/** The public operations GraphQL exposes, by name. */
	readonly operations: readonly string[]
	/** Root fields that write: generated mutations, then plugin commands. */
	readonly writes: readonly GraphqlWriteRoot[]
}

/** @internal Owns every disposable part behind one application facade. */
export interface GraphqlApplicationState {
	readonly connections: GraphqlConnectionRuntime
	readonly facts: GraphqlApplicationFacts
	readonly validationRules: readonly ValidationRule[]
	readonly networkless: GraphqlNetworklessExecution
	readonly operations: GraphqlOperationExecution
	readonly schemaMutations: GraphqlSchemaMutationExecution
	readonly schema: GraphQLSchema
}

// Removing the sole live state invalidates every facade and releases its graph.
const graphqlApplicationStates = new WeakMap<object, GraphqlApplicationState>()

const disposed = (): TypeError =>
	new TypeError('GraphQL application has been disposed')

const liveState = (application: object): GraphqlApplicationState => {
	const state = graphqlApplicationStates.get(application)
	if (state === undefined) throw disposed()
	return state
}

class GraphqlApplicationResource implements GraphqlApplication {
	constructor(state: GraphqlApplicationState) {
		graphqlApplicationStates.set(this, state)
		Object.freeze(this)
	}

	get schema(): GraphQLSchema {
		return liveState(this).schema
	}

	get validationRules(): readonly ValidationRule[] {
		return liveState(this).validationRules
	}

	execute(options: GraphqlExecuteOptions): Promise<ExecutionResult> {
		const state = graphqlApplicationStates.get(this)
		return state === undefined
			? Promise.reject(disposed())
			: state.networkless.execute(options)
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
	hint: 'Install @ultimabase/graphql-plugin and add graphqlPlugin() to UltimaBase.use(...).',
	providerPrivilege: 'transport:expose',
	compose: ([application]) => {
		assertGraphqlApplication(application)
		return application
	},
})

/** @internal Binds schema lifetime to the owning application capability. */
export const createGraphqlApplicationResource = (
	state: GraphqlApplicationState,
): ApplicationCapabilityResource<GraphqlApplication> => {
	const value = new GraphqlApplicationResource(state)
	return {
		value,
		dispose: (): void => {
			if (!graphqlApplicationStates.delete(value)) return
			state.connections.dispose()
			state.operations.dispose()
			state.schemaMutations.dispose()
		},
	}
}

/** @internal Late-binds Core's exact operation facade after engine construction. */
export const bindGraphqlOperationTransport = (
	application: GraphqlApplication,
	transport: ApplicationOperationTransport,
): void => {
	liveState(application).operations.bind(transport)
}

/** @internal Late-binds Core's exact schema-mutation facade. */
export const bindGraphqlSchemaMutationTransport = (
	application: GraphqlApplication,
	transport: ApplicationSchemaMutationTransport<typeof graphqlProtocol>,
): void => {
	liveState(application).schemaMutations.bind(transport)
}

/** @internal Reads the startup facts of a live application. */
export const readGraphqlApplicationFacts = (
	application: GraphqlApplication,
): GraphqlApplicationFacts => liveState(application).facts

/** @internal Resolves the private cursor owner retained by a live capability. */
export const readGraphqlConnectionRuntime = (
	application: GraphqlApplication,
): GraphqlConnectionRuntime => liveState(application).connections
