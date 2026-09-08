import {
	RequestContext,
	type ApplicationCallbackExecutor,
	type ApplicationRequestExecutor,
	type PluginIdentity,
} from '@ultimabase/core'
import { isPlainRecord } from '@ultimabase/shared'
import {
	GraphQLError,
	execute,
	validate,
	type DocumentNode,
	type ExecutionResult,
	type GraphQLSchema,
} from 'graphql'

import type { NormalizedGraphqlExecutionLimits } from './connection-limits.js'
import {
	prepareGraphqlDocument,
	prepareGraphqlVariables,
} from './document-limits.js'
import { createSafeGraphqlError } from './execution-errors.js'

/** Supplies a trusted context and one exact GraphQL operation document. */
export interface GraphqlExecuteOptions {
	readonly context: RequestContext
	readonly document: string | DocumentNode
	readonly operationName?: string
	readonly variables?: Readonly<Record<string, unknown>>
}

const optionKeys = new Set([
	'context',
	'document',
	'operationName',
	'variables',
])

const assertOptions: (
	value: unknown,
) => asserts value is GraphqlExecuteOptions = (value) => {
	if (!isPlainRecord(value)) {
		throw new TypeError('GraphQL execute options must be a plain object')
	}
	for (const key of Reflect.ownKeys(value)) {
		if (typeof key !== 'string' || !optionKeys.has(key)) {
			throw new TypeError(
				`GraphQL execute options contains unknown option: ${String(key)}`,
			)
		}
	}
	if (!(value.context instanceof RequestContext)) {
		throw new TypeError('GraphQL execute context must be a real RequestContext')
	}
	if (
		typeof value.document !== 'string' &&
		(!isPlainRecord(value.document) || value.document.kind !== 'Document')
	) {
		throw new TypeError(
			'GraphQL execute document must be a string or DocumentNode',
		)
	}
	if (
		value.operationName !== undefined &&
		(typeof value.operationName !== 'string' || value.operationName === '')
	) {
		throw new TypeError(
			'GraphQL execute operationName must be a non-empty string',
		)
	}
}

const errorResult = (error: unknown, requestId: string): ExecutionResult => ({
	errors: [
		error instanceof GraphQLError
			? error
			: createSafeGraphqlError(error, requestId),
	],
})

/** Owns validated request entry without exposing Core's executor to callers. */
export class GraphqlNetworklessExecution {
	readonly #callbacks: ApplicationCallbackExecutor
	readonly #executor: ApplicationRequestExecutor
	readonly #limits: NormalizedGraphqlExecutionLimits
	readonly #owner: PluginIdentity
	readonly #schema: GraphQLSchema

	constructor(
		options: Readonly<{
			readonly callbacks: ApplicationCallbackExecutor
			readonly executor: ApplicationRequestExecutor
			readonly limits: NormalizedGraphqlExecutionLimits
			readonly owner: PluginIdentity
			readonly schema: GraphQLSchema
		}>,
	) {
		this.#callbacks = options.callbacks
		this.#executor = options.executor
		this.#limits = options.limits
		this.#owner = options.owner
		this.#schema = options.schema
	}

	async execute(options: GraphqlExecuteOptions): Promise<ExecutionResult> {
		assertOptions(options)
		return await this.#callbacks.runPlugin(this.#owner, () =>
			this.#executor.runWithContext(options.context, async (context) => {
				let document: DocumentNode
				let variables: Readonly<Record<string, unknown>> | undefined
				try {
					document = prepareGraphqlDocument(
						options.document,
						options.operationName,
						this.#limits,
						context.requestId,
					)
					variables = prepareGraphqlVariables(
						options.variables,
						this.#limits.maxVariablesBytes,
						context.requestId,
					)
				} catch (error: unknown) {
					return errorResult(error, context.requestId)
				}
				const errors = validate(this.#schema, document)
				if (errors.length > 0) return { errors }
				return await execute({
					schema: this.#schema,
					document,
					contextValue: Object.freeze({ request: context }),
					operationName: options.operationName,
					variableValues: variables,
					abortSignal: context.signal,
				})
			}),
		)
	}
}
