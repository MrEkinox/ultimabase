import {
	RequestContext,
	type ApplicationCallbackExecutor,
	type ApplicationRequestExecutor,
	type ExposedOperationTransportBinding,
	type ExposedSchemaMutationTransportBinding,
	type PluginIdentity,
	type SchemaDefinition,
} from '@ultimabase/core'
import { isPlainRecord, isUnknownArray } from '@ultimabase/shared'
import type { GraphQLFieldResolver } from 'graphql'

import type { GraphqlConnectionRuntime } from './connection-runtime.js'
import { createSafeGraphqlError } from './execution-errors.js'
import {
	normalizeGraphqlMutation,
	type GraphqlMutationOperation,
} from './mutation-normalization.js'
import {
	normalizeGraphqlCollectionArguments,
	prepareGraphqlReadOperation,
	type GraphqlReadOperation,
} from './read-normalization.js'
import type { GraphqlOperationExecution } from './operation-execution.js'
import type { GraphqlSchemaMutationExecution } from './schema-mutation-execution.js'
import { normalizeGraphqlSelection } from './selection-normalization.js'

type GeneratedResolver = GraphQLFieldResolver<unknown, unknown>

// Generated resolvers accept only the exact `{ request }` context built by
// networkless execution or a network adapter.
const requestFromContext = (value: unknown): RequestContext => {
	const request: unknown = isPlainRecord(value) ? value.request : undefined
	if (
		!isPlainRecord(value) ||
		Reflect.ownKeys(value).length !== 1 ||
		!(request instanceof RequestContext)
	) {
		throw new TypeError(
			'GraphQL resolver context must contain one real RequestContext',
		)
	}
	return request
}

const requestIdFromContext = (value: unknown): string =>
	isPlainRecord(value) && value.request instanceof RequestContext
		? value.request.requestId
		: 'unavailable'

/** Owns generated resolver attribution and the sole path into Runtime. */
export class GraphqlGeneratedExecution {
	readonly #callbacks: ApplicationCallbackExecutor
	readonly #connections: GraphqlConnectionRuntime
	readonly #executor: ApplicationRequestExecutor
	readonly #operations: GraphqlOperationExecution
	readonly #owner: PluginIdentity
	readonly #schemaMutations: GraphqlSchemaMutationExecution

	constructor(
		options: Readonly<{
			readonly callbacks: ApplicationCallbackExecutor
			readonly connections: GraphqlConnectionRuntime
			readonly executor: ApplicationRequestExecutor
			readonly operations: GraphqlOperationExecution
			readonly owner: PluginIdentity
			readonly schemaMutations: GraphqlSchemaMutationExecution
		}>,
	) {
		this.#callbacks = options.callbacks
		this.#connections = options.connections
		this.#executor = options.executor
		this.#operations = options.operations
		this.#owner = options.owner
		this.#schemaMutations = options.schemaMutations
	}

	async #run<TResult>(
		contextValue: unknown,
		callback: (context: RequestContext) => Promise<TResult> | TResult,
	): Promise<TResult> {
		try {
			const request = requestFromContext(contextValue)
			return await this.#callbacks.runPlugin(this.#owner, () =>
				this.#executor.runWithContext(request, () => callback(request)),
			)
		} catch (error: unknown) {
			throw createSafeGraphqlError(error, requestIdFromContext(contextValue))
		}
	}

	read(
		schema: SchemaDefinition,
		operation: GraphqlReadOperation,
	): GeneratedResolver {
		return (_source, args, contextValue, info) =>
			this.#run(contextValue, async (context) => {
				const prepared = prepareGraphqlReadOperation(
					schema,
					operation,
					args,
					info,
					{ connections: this.#connections },
				)
				const result = await this.#executor.executeRead(
					context,
					prepared.operation,
				)
				if (operation !== 'findMany') return result
				if (prepared.page === undefined || !isUnknownArray(result)) {
					throw new TypeError('GraphQL collection execution is malformed')
				}
				return this.#connections.page(prepared.page, result)
			})
	}

	mutation(
		schema: SchemaDefinition,
		operation: GraphqlMutationOperation,
	): GeneratedResolver {
		return (_source, args, contextValue, info) =>
			this.#run(contextValue, (context) => {
				const request = normalizeGraphqlMutation(
					schema,
					operation,
					args,
					info,
					this.#connections,
				)
				return this.#executor.executeMutation(context, schema, request)
			})
	}

	operation(
		operation: ExposedOperationTransportBinding,
		input: unknown,
		contextValue: unknown,
	): Promise<unknown> {
		return this.#run(contextValue, (context) =>
			this.#operations.execute(context, operation, input),
		)
	}

	schemaMutation(
		descriptor: ExposedSchemaMutationTransportBinding,
		schema: SchemaDefinition,
		hasPayload: boolean,
	): GeneratedResolver {
		return (_source, args, contextValue, info) =>
			this.#run(contextValue, (context) => {
				if (
					!isPlainRecord(args) ||
					Reflect.ownKeys(args).length !== 1 ||
					!isPlainRecord(args.input) ||
					typeof args.input.id !== 'string'
				) {
					throw new TypeError(
						'GraphQL schema mutation requires one input object with an ID',
					)
				}
				const projection = normalizeGraphqlSelection(
					schema,
					info,
					false,
					(target, relationArgs, scope) =>
						normalizeGraphqlCollectionArguments(
							target,
							relationArgs,
							this.#connections,
							scope,
						),
					descriptor.effect === 'delete' ? 'stored-pointer-only' : 'include',
				)
				return this.#schemaMutations.execute({
					context,
					descriptor,
					id: args.input.id,
					...projection,
					input: hasPayload ? args.input.data : undefined,
					schema,
				})
			})
	}

	relation(
		sourceSchema: SchemaDefinition,
		fieldName: string,
		targetSchema: SchemaDefinition,
		targetTypeName: string,
	): GeneratedResolver {
		return (source, args, contextValue) =>
			this.#run(contextValue, () => {
				if (typeof source !== 'object' || source === null) return null
				const value: unknown = Reflect.get(source, fieldName)
				if (value === null || value === undefined) return null
				if (!isUnknownArray(value)) {
					throw new TypeError('GraphQL relation result must be an array')
				}
				const prepared = this.#connections.prepare({
					arguments: args,
					relationPath: [sourceSchema.className, fieldName],
					schema: targetSchema,
					typeName: targetTypeName,
				})
				return this.#connections.page(prepared.page, value)
			})
	}
}
