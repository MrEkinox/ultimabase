import {
	RequestContext,
	type ApplicationCallbackExecutor,
	type ApplicationRequestExecutor,
	type ExposedOperationTransportBinding,
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
	prepareGraphqlReadOperation,
	type GraphqlReadOperation,
} from './read-normalization.js'
import type { GraphqlOperationExecution } from './operation-execution.js'

type GeneratedResolver = GraphQLFieldResolver<unknown, unknown>

const assertRequestContext: (
	value: unknown,
) => asserts value is RequestContext = (value) => {
	if (!(value instanceof RequestContext)) {
		throw new TypeError(
			'GraphQL resolver context must contain one real RequestContext',
		)
	}
}

const requestFromContext = (value: unknown): RequestContext => {
	const request: unknown = isPlainRecord(value) ? value.request : undefined
	if (!isPlainRecord(value) || Reflect.ownKeys(value).length !== 1) {
		throw new TypeError(
			'GraphQL resolver context must contain one real RequestContext',
		)
	}
	assertRequestContext(request)
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

	constructor(
		options: Readonly<{
			readonly callbacks: ApplicationCallbackExecutor
			readonly connections: GraphqlConnectionRuntime
			readonly executor: ApplicationRequestExecutor
			readonly operations: GraphqlOperationExecution
			readonly owner: PluginIdentity
		}>,
	) {
		this.#callbacks = options.callbacks
		this.#connections = options.connections
		this.#executor = options.executor
		this.#operations = options.operations
		this.#owner = options.owner
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
