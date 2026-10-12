import { getCurrentRequest } from '@ultimabase/core'
import {
	graphqlProtocol,
	type GraphqlApplication,
} from '@ultimabase/graphql-plugin'
import { httpMount, type HttpMountDefinition } from '@ultimabase/http-plugin'
import {
	GraphQLError,
	NoSchemaIntrospectionCustomRule,
	validate,
	type DocumentNode,
	type ExecutionArgs,
	type GraphQLSchema,
	type ExecutionResult,
} from 'graphql'
import { createYoga, type Plugin } from 'graphql-yoga'

import { parseGraphqlRequestBody } from './body.js'
import {
	createGraphqlHttpFailure,
	createGraphqlHttpFailureResponse,
	sanitizeGraphqlExecutionResult,
} from './errors.js'
import {
	graphqlResponseMediaType,
	hasGraphqlJsonContentType,
	selectGraphqlResponseMediaType,
} from './media.js'
import type { NormalizedGraphqlYogaPluginOptions } from './options.js'

type YogaPlugin = Plugin<
	Record<string, unknown>,
	Record<string, unknown>,
	Record<string, unknown>
>

interface GraphqlYogaMountResource {
	readonly dispose: () => Promise<void>
	readonly mount: HttpMountDefinition
}

/** @internal Owns exactly one disposable Yoga adapter for one application. */
export const createGraphqlYogaMountResource = (
	application: GraphqlApplication,
	options: NormalizedGraphqlYogaPluginOptions,
): GraphqlYogaMountResource => {
	const plugins: YogaPlugin[] = [
		{
			onRequestParse: ({ setRequestParser }) => {
				setRequestParser((request) =>
					// Without its own limit GraphQL inherits the HTTP one, which HTTP enforces.
					parseGraphqlRequestBody(
						request,
						options.bodyLimit ?? Number.MAX_SAFE_INTEGER,
					),
				)
			},
		},
		{
			onParse:
				() =>
				({ result, replaceParseResult }) => {
					if (!(result instanceof Error)) return
					replaceParseResult(
						createGraphqlHttpFailure({
							code: 'GRAPHQL_PARSE_FAILED',
							message: result.message,
							originalError: result,
							status: 400,
						}),
					)
				},
		},
		{
			onValidate: ({ setValidationFn }) => {
				// The application's rules name how to enable a disabled feature
				// (ADR-0325); introspection off adds GraphQL's own rule.
				const rules = options.introspection
					? application.validationRules
					: [...application.validationRules, NoSchemaIntrospectionCustomRule]
				setValidationFn(
					(
						schema: GraphQLSchema,
						document: DocumentNode,
					): readonly GraphQLError[] => validate(schema, document, rules),
				)
				return ({ result, setResult, valid }) => {
					if (valid) return
					setResult(
						result.map((error: Error) =>
							createGraphqlHttpFailure({
								code: 'GRAPHQL_VALIDATION_FAILED',
								message: error.message,
								nodes: error instanceof GraphQLError ? error.nodes : undefined,
								status: 400,
							}),
						),
					)
				}
			},
		},
		{
			onExecute: ({ setExecuteFn }) => {
				setExecuteFn(async (args: ExecutionArgs): Promise<ExecutionResult> => {
					const request = getCurrentRequest()
					request.signal.throwIfAborted()
					return await application.execute({
						context: request,
						document: args.document,
						...(typeof args.operationName === 'string'
							? { operationName: args.operationName }
							: {}),
						...(args.variableValues == null
							? {}
							: { variables: args.variableValues }),
					})
				})
			},
		},
		{
			onExecutionResult: (payload) => {
				if (
					payload.result === undefined ||
					Symbol.asyncIterator in payload.result
				) {
					return
				}
				payload.setResult(sanitizeGraphqlExecutionResult(payload.result))
			},
		},
	]

	// Yoga only parses, validates and serializes: every built-in feature that
	// could widen the surface is off, and execution goes through the
	// application so Core keeps the request context and authorization.
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
		plugins,
		schema: application.schema,
	})

	const handle = async (request: Request): Promise<Response> => {
		const requestedMediaType = selectGraphqlResponseMediaType(
			request.headers.get('accept'),
		)
		const mediaType = requestedMediaType ?? graphqlResponseMediaType
		if (new URL(request.url).pathname !== options.path) {
			return createGraphqlHttpFailureResponse({
				code: 'NOT_FOUND',
				mediaType,
				message: 'The requested GraphQL endpoint was not found.',
				status: 404,
			})
		}
		if (request.method !== 'POST') {
			return createGraphqlHttpFailureResponse({
				allow: 'POST',
				code: 'METHOD_NOT_ALLOWED',
				mediaType,
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
		if (!hasGraphqlJsonContentType(request.headers.get('content-type'))) {
			return createGraphqlHttpFailureResponse({
				code: 'UNSUPPORTED_MEDIA_TYPE',
				mediaType,
				message: 'GraphQL requests must use application/json with UTF-8.',
				status: 415,
			})
		}
		request.signal.throwIfAborted()
		// Yoga serializes for the single negotiated representation.
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
			// An explicit GraphQL bodyLimit replaces the HTTP one (ADR-0323).
			...(options.bodyLimit === undefined
				? {}
				: { bodyLimit: options.bodyLimit }),
			handle,
			path: options.path,
			protocol: {
				name: graphqlProtocol.name,
				version: graphqlProtocol.version,
			},
		}),
	}
}
