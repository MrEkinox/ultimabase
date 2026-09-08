import { getCurrentRequest } from '@ultimabase/core'
import {
	graphqlProtocol,
	type GraphqlApplication,
} from '@ultimabase/graphql-plugin'
import { httpMount, type HttpMountDefinition } from '@ultimabase/http-plugin'
import {
	GraphQLError,
	NoSchemaIntrospectionCustomRule,
	type ExecutionArgs,
	type ExecutionResult,
} from 'graphql'
import { createYoga, type Plugin } from 'graphql-yoga'

import { parseGraphqlRequestBody } from './body.js'
import {
	createGraphqlHttpFailureResponse,
	sanitizeGraphqlExecutionResult,
} from './errors.js'
import {
	graphqlResponseMediaType,
	hasGraphqlJsonContentType,
	selectGraphqlResponseMediaType,
} from './media.js'
import type { NormalizedGraphqlYogaPluginOptions } from './options.js'

interface GraphqlYogaMountResource {
	readonly dispose: () => Promise<void>
	readonly mount: HttpMountDefinition
}

const executeThroughApplication = async (
	application: GraphqlApplication,
	args: ExecutionArgs,
): Promise<ExecutionResult> => {
	const request = getCurrentRequest()
	request.signal.throwIfAborted()
	return await application.execute({
		context: request,
		document: args.document,
		...(typeof args.operationName === 'string'
			? { operationName: args.operationName }
			: {}),
		...(args.variableValues === undefined || args.variableValues === null
			? {}
			: { variables: args.variableValues }),
	})
}

type YogaPlugin = Plugin<
	Record<string, unknown>,
	Record<string, unknown>,
	Record<string, unknown>
>

const requestParserPlugin = (bodyLimit: number): YogaPlugin => ({
	onRequestParse: ({ setRequestParser }) => {
		setRequestParser((request) => parseGraphqlRequestBody(request, bodyLimit))
	},
})

const safeParseErrorPlugin = (): YogaPlugin => ({
	onParse:
		() =>
		({ result, replaceParseResult }) => {
			if (!(result instanceof Error)) return
			replaceParseResult(
				new GraphQLError(result.message, {
					extensions: {
						code: 'GRAPHQL_PARSE_FAILED',
						http: { status: 400 },
						requestId: getCurrentRequest().requestId,
						retryable: false,
					},
					originalError: result,
				}),
			)
		},
})

const validationPlugin = (introspection: boolean): YogaPlugin => ({
	onValidate: ({ addValidationRule }) => {
		if (!introspection) addValidationRule(NoSchemaIntrospectionCustomRule)
		return ({ result, setResult, valid }) => {
			if (valid) return
			setResult(
				result.map(
					(error: Error) =>
						new GraphQLError(error.message, {
							extensions: {
								code: 'GRAPHQL_VALIDATION_FAILED',
								http: { status: 400 },
								requestId: getCurrentRequest().requestId,
								retryable: false,
							},
							nodes: error instanceof GraphQLError ? error.nodes : undefined,
						}),
				),
			)
		}
	},
})

const applicationExecutionPlugin = (
	application: GraphqlApplication,
): YogaPlugin => ({
	onExecute: ({ setExecuteFn }) => {
		setExecuteFn((args) => executeThroughApplication(application, args))
	},
})

const safeResultPlugin = (): YogaPlugin => ({
	onExecutionResult: (payload) => {
		if (
			payload.result === undefined ||
			Symbol.asyncIterator in payload.result
		) {
			return
		}
		payload.setResult(sanitizeGraphqlExecutionResult(payload.result))
	},
})

/** @internal Owns exactly one disposable Yoga adapter for one application. */
export const createGraphqlYogaMountResource = (
	application: GraphqlApplication,
	options: NormalizedGraphqlYogaPluginOptions,
): GraphqlYogaMountResource => {
	const yoga = createYoga({
		batching: false,
		cors: false,
		disposeOnProcessTerminate: false,
		graphqlEndpoint: options.path,
		graphiql: false,
		healthCheckEndpoint: undefined,
		landingPage: false,
		logging: false,
		maskedErrors: true,
		multipart: false,
		parserAndValidationCache: false,
		plugins: [
			requestParserPlugin(options.bodyLimit),
			safeParseErrorPlugin(),
			validationPlugin(options.introspection),
			applicationExecutionPlugin(application),
			safeResultPlugin(),
		],
		schema: application.schema,
	})

	const handle = async (request: Request): Promise<Response> => {
		const requestedMediaType = selectGraphqlResponseMediaType(
			request.headers.get('accept'),
		)
		const failureMediaType = requestedMediaType ?? graphqlResponseMediaType
		if (new URL(request.url).pathname !== options.path) {
			return createGraphqlHttpFailureResponse({
				code: 'NOT_FOUND',
				mediaType: failureMediaType,
				message: 'The requested GraphQL endpoint was not found.',
				status: 404,
			})
		}
		if (request.method !== 'POST') {
			return createGraphqlHttpFailureResponse({
				allow: 'POST',
				code: 'METHOD_NOT_ALLOWED',
				mediaType: failureMediaType,
				message: 'GraphQL over HTTP accepts POST requests only.',
				status: 405,
			})
		}
		if (requestedMediaType === undefined) {
			return createGraphqlHttpFailureResponse({
				code: 'NOT_ACCEPTABLE',
				message: 'No acceptable GraphQL response media type was requested.',
				status: 406,
			})
		}
		const mediaType = requestedMediaType
		if (!hasGraphqlJsonContentType(request.headers.get('content-type'))) {
			return createGraphqlHttpFailureResponse({
				code: 'UNSUPPORTED_MEDIA_TYPE',
				mediaType,
				message: 'GraphQL requests must use application/json with UTF-8.',
				status: 415,
			})
		}
		request.signal.throwIfAborted()
		const headers = new Headers(request.headers)
		headers.set('Accept', mediaType)
		const response = await yoga.fetch(new Request(request, { headers }))
		request.signal.throwIfAborted()
		const responseHeaders = new Headers(response.headers)
		responseHeaders.set('Cache-Control', 'no-store')
		return new Response(response.body, {
			headers: responseHeaders,
			status: response.status,
			statusText: response.statusText,
		})
	}

	return {
		dispose: async (): Promise<void> => {
			await yoga.dispose()
		},
		mount: httpMount({
			handle,
			path: options.path,
			protocol: {
				name: graphqlProtocol.name,
				version: graphqlProtocol.version,
			},
		}),
	}
}
